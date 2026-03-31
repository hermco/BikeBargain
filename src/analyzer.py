"""
Algorithme de scoring et classement des annonces BikeBargain.

Calcule un prix effectif reel pour chaque annonce en prenant en compte :
  - Les accessoires detectes (valeur occasion deduite)
  - L'usure des consommables au tarif garage (cout ajoute)
  - La garantie constructeur restante
  - L'usure mecanique generale
  - Le risque d'etat / incertitude

Les parametres de calcul (consommables, garantie, usure, seuils) sont charges
depuis la base de donnees en fonction du modele de moto.

Usage :
    python -m src.analyzer
"""

from datetime import date, datetime
from typing import Optional

from sqlmodel import Session, select
from .models import Ad


def _parse_date(date_str: Optional[str]) -> Optional[date]:
    """Parse une date ISO depuis la BDD."""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00")).date()
    except (ValueError, TypeError):
        return None


def _estimate_circulation_date(year: Optional[int], pub_date_str: Optional[str]) -> Optional[date]:
    """
    Estime la date de premiere mise en circulation.

    Priorite :
      1. L'annee du vehicule (on suppose mise en circulation au 01/07 de cette annee)
      2. Fallback sur la date de publication - 6 mois
    """
    if year:
        return date(year, 7, 1)
    pub = _parse_date(pub_date_str)
    if pub:
        # Estimation : 6 mois avant publication de l'annonce
        month = pub.month - 6
        y = pub.year
        if month <= 0:
            month += 12
            y -= 1
        return date(y, month, 1)
    return None


def compute_consumable_wear(km: int, consumables: list) -> dict:
    """
    Calcule l'usure des consommables pour un kilometrage donne.

    Args:
        km: Kilometrage du vehicule.
        consumables: Liste d'objets BikeConsumable avec .name, .cost_eur, .life_km.

    Returns:
        {
            "total_wear": int,
            "details": [
                {
                    "name": str,
                    "garage_cost": int,
                    "life_km": int,
                    "wear_pct": float,
                    "cost_consumed": int,
                    "remaining_km": int,
                    "short_term": bool,
                }
            ]
        }
    """
    details = []
    total_wear = 0

    for c in consumables:
        name = c.name
        cost = c.cost_eur
        life = c.life_km

        pct = min(km / life, 1.0)
        consumed = int(cost * pct)
        remaining = max(life - (km % life), 0)

        details.append({
            "name": name,
            "garage_cost": cost,
            "life_km": life,
            "wear_pct": round(pct * 100, 1),
            "cost_consumed": consumed,
            "remaining_km": remaining,
            "short_term": False,  # Sera mis a jour par rank_ads avec le seuil du config
        })
        total_wear += consumed

    return {"total_wear": total_wear, "details": details}


def compute_warranty(year: Optional[int], pub_date_str: Optional[str],
                     config, today: Optional[date] = None) -> dict:
    """
    Calcule la garantie restante et sa valeur.

    Args:
        year: Annee du vehicule.
        pub_date_str: Date de premiere publication (ISO).
        config: Objet BikeModelConfig avec .warranty_years, .warranty_value_per_year.
        today: Date de reference (defaut: aujourd'hui).

    Returns:
        {
            "circulation_date": str or None,
            "expiry_date": str or None,
            "remaining_days": int,
            "remaining_years": float,
            "value": int,
        }
    """
    today = today or date.today()
    circ = _estimate_circulation_date(year, pub_date_str)

    if not circ:
        return {
            "circulation_date": None,
            "expiry_date": None,
            "remaining_days": 0,
            "remaining_years": 0.0,
            "value": 0,
        }

    warranty_years = config.warranty_years
    warranty_value_per_year = config.warranty_value_per_year

    expiry = date(circ.year + warranty_years, circ.month, circ.day)
    remaining_days = max((expiry - today).days, 0)
    remaining_years = round(remaining_days / 365.25, 1)
    value = int(remaining_years * warranty_value_per_year)

    return {
        "circulation_date": circ.isoformat(),
        "expiry_date": expiry.isoformat(),
        "remaining_days": remaining_days,
        "remaining_years": remaining_years,
        "value": value,
    }


def rank_ads(bike_model_id: int, session: Session, today: Optional[date] = None) -> list[dict]:
    """
    Analyse et classe toutes les annonces d'un modele en base.

    Prix effectif = prix_affiche - accessoires_occasion + usure_consommables
                    + usure_mecanique + risque_etat - valeur_garantie

    Plus la decote est grande, meilleur est le deal.

    Args:
        bike_model_id: ID du modele de moto.
        session: SQLModel session (injectee par FastAPI Depends ou fournie manuellement).
        today: Date de reference pour le calcul de garantie (defaut: aujourd'hui).

    Returns:
        Liste de dicts tries par decote decroissante (meilleur deal en premier).
    """
    from .database import get_bike_model_config, get_bike_consumables, get_all_ads

    config = get_bike_model_config(session, bike_model_id)
    if not config:
        return []

    consumables = get_bike_consumables(session, bike_model_id)

    # Charger les annonces de ce modele
    all_ads = get_all_ads(session)
    ads = [a for a in all_ads if a.get("bike_model_id") == bike_model_id]

    mechanical_wear_per_km = config.mechanical_wear_per_km
    condition_risk_per_km = config.condition_risk_per_km
    short_term_km_threshold = config.short_term_km_threshold

    results = []

    for ad in ads:
        accs = ad.get("accessories", [])
        acc_used = sum(a["estimated_used_price"] for a in accs)
        acc_new = sum(a["estimated_new_price"] for a in accs)

        km = ad.get("mileage_km") or 0
        new_price = ad.get("estimated_new_price") or 0
        price = ad.get("price") or 0

        # Usure consommables
        wear = compute_consumable_wear(km, consumables)

        # Mettre a jour le flag short_term avec le seuil du config
        for detail in wear["details"]:
            detail["short_term"] = detail["remaining_km"] <= short_term_km_threshold

        # Usure mecanique generale
        mechanical_wear = int(km * mechanical_wear_per_km)

        # Risque d'etat / incertitude
        condition_risk = int(km * condition_risk_per_km)

        # Garantie
        warranty = compute_warranty(
            ad.get("year"),
            ad.get("first_publication_date"),
            config,
            today,
        )

        # Prix effectif
        effective = price - acc_used + wear["total_wear"] + mechanical_wear + condition_risk - warranty["value"]

        # Decote par rapport au neuf
        decote_pct = ((new_price - effective) / new_price * 100) if new_price else 0

        # Depenses court terme
        short_term_items = []
        for c in wear["details"]:
            if c["short_term"]:
                short_term_items.append({
                    "name": c["name"],
                    "garage_cost": c["garage_cost"],
                    "remaining_km": c["remaining_km"],
                    "reason": f"{c['wear_pct']}% usé, remplacement dans ~{c['remaining_km']} km",
                })
        short_term_total = sum(s["garage_cost"] for s in short_term_items)

        results.append({
            "id": ad["id"],
            "url": ad.get("url", ""),
            "listing_status": ad.get("listing_status", "online"),
            "city": ad.get("city", "?"),
            "lat": ad.get("lat"),
            "lng": ad.get("lng"),
            "variant": ad.get("variant", "?"),
            "color": ad.get("color", "?"),
            "wheel_type": ad.get("wheel_type", ""),
            "year": ad.get("year"),
            "km": km,
            "price": int(price),
            "new_price": int(new_price),
            # Accessoires
            "accessories": accs,
            "acc_count": len(accs),
            "acc_new_total": acc_new,
            "acc_used_total": acc_used,
            # Consommables
            "wear_total": wear["total_wear"],
            "wear_details": wear["details"],
            # Usure mecanique
            "mechanical_wear": mechanical_wear,
            # Risque d'etat
            "condition_risk": condition_risk,
            # Garantie
            "warranty": warranty,
            # Synthese
            "effective_price": int(effective),
            "decote_pct": round(decote_pct, 1),
            "short_term_items": short_term_items,
            "short_term_total": short_term_total,
        })

    results.sort(key=lambda x: x["decote_pct"], reverse=True)
    return results


def print_report(bike_model_id: int = None, results: Optional[list[dict]] = None) -> None:
    """Affiche le rapport comparatif dans le terminal."""
    if results is None:
        from .database import engine, get_bike_models
        with Session(engine) as session:
            if bike_model_id is None:
                # Utiliser le premier modele actif
                models = get_bike_models(session)
                if not models:
                    print("Aucun modele de moto en base.")
                    return
                bike_model_id = models[0].id
            results = rank_ads(bike_model_id, session)

    if not results:
        print("Aucune annonce en base.")
        return

    # Charger le config pour afficher les parametres
    from .database import engine, get_bike_model_config
    with Session(engine) as session:
        config = get_bike_model_config(session, bike_model_id)

    # ─── Tableau comparatif ───────────────────────────────────────────────

    print()
    print("=" * 100)
    print("  CLASSEMENT DES ANNONCES BIKEBARGAIN  ".center(100, "="))
    print("=" * 100)
    print()

    # En-tete
    header = (
        f"{'#':>2}  {'Ville':<20} {'Couleur':<22} {'Km':>6}  "
        f"{'Affiché':>7}  {'Acc.':>5}  {'Conso.':>6}  {'Méca.':>5}  {'Risque':>6}  {'Gar.':>5}  "
        f"{'Effectif':>8}  {'Décote':>7}  {'Ct.terme':>8}"
    )
    print(header)
    print("─" * 120)

    for i, r in enumerate(results, 1):
        color_str = r['color'] or r['variant'] or '?'
        if r['wheel_type'] == 'tubeless':
            color_str += ' TL'
        acc_names = ", ".join(a["name"] for a in r["accessories"]) if r["accessories"] else "aucun"
        line = (
            f"{i:>2}  {r['city']:<20} {color_str:<22} {r['km']:>5}  "
            f"{r['price']:>6}€  {-r['acc_used_total']:>+5}  {r['wear_total']:>+5}€  "
            f"{r['mechanical_wear']:>+5}  {r['condition_risk']:>+5}€  {-r['warranty']['value']:>+5}  "
            f"{r['effective_price']:>7}€  {-r['decote_pct']:>+6.1f}%  "
            f"{r['short_term_total']:>6}€"
        )
        print(line)
        print(f"      ({acc_names})")

    print("─" * 120)
    print()
    print("Formule : Effectif = Affiché - Accessoires(occasion) + Consommables(garage) + Mécanique(usure) + Risque état - Garantie restante")
    if config:
        print(f"Usure mécanique générale : {config.mechanical_wear_per_km} EUR/km (suspension, disques, embrayage, roulements)")
        print(f"Risque d'état : {config.condition_risk_per_km} EUR/km (incertitude entretien, chutes, usure cachée)")
        print(f"Garantie constructeur : {config.warranty_years} ans | Valeur : {config.warranty_value_per_year} EUR/an restant")
        print(f"Seuil court terme : consommable à remplacer dans < {config.short_term_km_threshold} km")
    print()

    # ─── Detail par annonce ───────────────────────────────────────────────

    for i, r in enumerate(results, 1):
        color_str = r['color'] or r['variant'] or '?'
        if r['wheel_type'] == 'tubeless':
            color_str += ' TL'
        print("=" * 100)
        print(f"  #{i}  {r['city']} — {color_str} — {r['year']} — {r['km']} km")
        print(f"  {r['url']}")
        print(f"  Prix affiché: {r['price']} EUR  |  Prix neuf: {r['new_price']} EUR  |  "
              f"Effectif: {r['effective_price']} EUR  |  Décote: -{r['decote_pct']}%")
        print("=" * 100)

        # Accessoires
        print(f"\n  Accessoires ({r['acc_count']}) — {r['acc_new_total']} EUR neuf / {r['acc_used_total']} EUR occasion")
        if r["accessories"]:
            print(f"  {'Nom':<42} {'Catégorie':<14} {'Neuf':>6} {'Occasion':>8}")
            print(f"  {'─'*42} {'─'*14} {'─'*6} {'─'*8}")
            for a in r["accessories"]:
                print(f"  {a['name']:<42} {a['category']:<14} {a['estimated_new_price']:>5}€ {a['estimated_used_price']:>7}€")
        else:
            print("  (aucun accessoire détecté)")

        # Consommables
        print(f"\n  Usure consommables — +{r['wear_total']} EUR")
        print(f"  {'Consommable':<27} {'Usure':>6} {'Consommé':>9} {'Restant':>10} {'Coût garage':>12}")
        print(f"  {'─'*27} {'─'*6} {'─'*9} {'─'*10} {'─'*12}")
        for c in r["wear_details"]:
            alert = " !!" if c["short_term"] else ""
            print(f"  {c['name']:<27} {c['wear_pct']:>5.1f}% {c['cost_consumed']:>8}€ "
                  f"{c['remaining_km']:>8} km {c['garage_cost']:>10}€{alert}")

        # Usure mecanique
        if config:
            print(f"\n  Usure mécanique générale — +{r['mechanical_wear']} EUR ({r['km']} km × {config.mechanical_wear_per_km} EUR/km)")
            print(f"  Risque d'état — +{r['condition_risk']} EUR ({r['km']} km × {config.condition_risk_per_km} EUR/km)")

        # Garantie
        w = r["warranty"]
        print(f"\n  Garantie — {w['remaining_years']} an(s) restant(s) — valeur {w['value']} EUR")
        if w["circulation_date"]:
            print(f"  Mise en circulation estimée: {w['circulation_date']}  |  Fin garantie: {w['expiry_date']}")

        # Depenses court terme
        if r["short_term_items"]:
            print(f"\n  ⚠ Dépenses court terme — {r['short_term_total']} EUR")
            for s in r["short_term_items"]:
                print(f"    → {s['name']}: {s['garage_cost']} EUR ({s['reason']})")
        else:
            print(f"\n  Aucune dépense court terme à prévoir")

        print()


if __name__ == "__main__":
    print_report()
