#!/usr/bin/env python3
"""
Himalayan 450 Analyzer - CLI pour extraire et stocker les annonces LeBonCoin.

Usage:
    python main.py add <url>              Ajouter une annonce depuis un lien LeBonCoin
    python main.py add <url1> <url2> ...  Ajouter plusieurs annonces
    python main.py list                   Lister toutes les annonces stockees
    python main.py show <id>              Afficher le detail d'une annonce
    python main.py stats                  Afficher les statistiques globales
    python main.py export                 Exporter toutes les annonces en CSV
"""

import sys
import csv
from pathlib import Path

from sqlmodel import Session, select
from sqlalchemy.orm import selectinload

from src.database import engine, run_migrations, upsert_ad, get_all_ads, get_ad_count, get_accessory_overrides
from src.models import Ad, AdAttribute, AdAccessory, AdImage
from src.extractor import fetch_ad, _estimate_new_price
from src.accessories import estimate_total_accessories_value, ACCESSORY_PATTERNS


def _format_price(price) -> str:
    if price is None:
        return "N/A"
    return f"{price:,.0f} EUR".replace(",", " ")


def _format_diff(price, new_price) -> str:
    if price is None or new_price is None:
        return ""
    diff = price - new_price
    pct = (diff / new_price) * 100
    sign = "+" if diff >= 0 else ""
    return f"{sign}{diff:,.0f} EUR ({sign}{pct:.1f}%)".replace(",", " ")


def _get_available_colors() -> list[str]:
    from src.extractor import NEW_PRICES
    return sorted(set(info["color"] for info in NEW_PRICES.values()))


def _confirm_extraction(ad_data: dict) -> dict | None:
    """
    Demande confirmation a l'utilisateur avant insertion.
    Permet de corriger la couleur et retirer des accessoires.
    """
    accessories = ad_data.get("accessories", [])

    print(f"\n  --- Verification ---")
    print(f"  [o] Tout est correct, inserer en base")
    print(f"  [c] Corriger la couleur")
    if accessories:
        print(f"  [r] Retirer un ou plusieurs accessoires")
    print(f"  [n] Annuler (ne pas inserer)")

    while True:
        choix = input("\n  Votre choix : ").strip().lower()

        if choix == "o":
            return ad_data

        elif choix == "n":
            return None

        elif choix == "c":
            colors = _get_available_colors()
            print(f"\n  Couleurs disponibles :")
            for i, color in enumerate(colors, 1):
                print(f"    {i}. {color}")
            print(f"    0. Saisie libre")

            while True:
                c_input = input(f"\n  Numero ou couleur [{ad_data.get('color', 'N/A')}] : ").strip()
                if not c_input:
                    break
                if c_input.isdigit():
                    idx = int(c_input)
                    if idx == 0:
                        new_color = input("  Couleur : ").strip()
                        if new_color:
                            ad_data["color"] = new_color
                        break
                    elif 1 <= idx <= len(colors):
                        ad_data["color"] = colors[idx - 1]
                        break
                    else:
                        print(f"  Numero invalide (1-{len(colors)} ou 0)")
                else:
                    ad_data["color"] = c_input
                    break

            new_price = _estimate_new_price(
                ad_data.get("variant"), ad_data.get("color"), ad_data.get("wheel_type")
            )
            if new_price:
                ad_data["estimated_new_price"] = new_price

            print(f"  -> Couleur mise a jour : {ad_data['color']}")
            if ad_data.get("estimated_new_price"):
                print(f"  -> Prix neuf recalcule : {_format_price(ad_data['estimated_new_price'])}")

        elif choix == "r" and accessories:
            print(f"\n  Accessoires actuels :")
            for i, acc in enumerate(accessories, 1):
                print(f"    {i}. [{acc['category']:>11}] {acc['name']}")
            print(f"\n  Numeros a retirer (ex: 1,3,5) ou 'all' pour tout retirer :")

            r_input = input("  > ").strip().lower()
            if r_input == "all":
                ad_data["accessories"] = []
                accessories = []
                print("  -> Tous les accessoires retires.")
            elif r_input:
                try:
                    indices = [int(x.strip()) - 1 for x in r_input.split(",")]
                    to_remove = [accessories[i]["name"] for i in indices if 0 <= i < len(accessories)]
                    ad_data["accessories"] = [a for a in accessories if a["name"] not in to_remove]
                    accessories = ad_data["accessories"]
                    print(f"  -> {len(to_remove)} accessoire(s) retire(s). Reste : {len(accessories)}")
                except (ValueError, IndexError):
                    print("  Saisie invalide.")

        else:
            print("  Choix invalide.")
            continue

        # Re-afficher le resume apres modification
        print(f"\n  Resume mis a jour :")
        print(f"    Couleur     : {ad_data.get('color', 'N/A')}")
        print(f"    Variante    : {ad_data.get('variant', 'Non detectee')}")
        if ad_data.get("estimated_new_price"):
            print(f"    Prix neuf   : {_format_price(ad_data['estimated_new_price'])}")
            print(f"    Ecart       : {_format_diff(ad_data['price'], ad_data['estimated_new_price'])}")
        accessories = ad_data.get("accessories", [])
        if accessories:
            valuation = estimate_total_accessories_value(accessories)
            print(f"    Accessoires ({len(accessories)}) - Neuf: {_format_price(valuation['total_new_price'])} / Occasion: ~{_format_price(valuation['total_used_price'])}")
            for i, acc in enumerate(accessories, 1):
                print(f"      {i}. {acc['name']}")
        else:
            print(f"    Accessoires : Aucun")

        print(f"\n  [o] Valider  [c] Corriger couleur  {'[r] Retirer accessoire  ' if accessories else ''}[n] Annuler")


def cmd_add(urls: list[str]) -> None:
    """Ajoute une ou plusieurs annonces a la base."""
    from src.extractor import get_lbc_client
    client = get_lbc_client()

    with Session(engine) as session:
        for url in urls:
            url = url.strip()
            if not url:
                continue

            print(f"\n{'='*60}")
            print(f"Extraction : {url}")
            print(f"{'='*60}")

            try:
                overrides = get_accessory_overrides(session)
                ad_data = fetch_ad(url, client=client, price_overrides=overrides)

                print(f"  ID          : {ad_data['id']}")
                print(f"  Titre       : {ad_data['subject']}")
                print(f"  Prix        : {_format_price(ad_data['price'])}")
                print(f"  Annee       : {ad_data.get('year', 'N/A')}")
                print(f"  Kilometrage : {ad_data.get('mileage_km', 'N/A')} km")
                print(f"  Couleur     : {ad_data.get('color', 'N/A')}")
                print(f"  Variante    : {ad_data.get('variant', 'Non detectee')}")
                print(f"  Jantes      : {ad_data.get('wheel_type', 'N/A')}")
                print(f"  Localisation: {ad_data.get('city', '?')}, {ad_data.get('department', '?')}")

                if ad_data.get("estimated_new_price"):
                    print(f"  Prix neuf   : {_format_price(ad_data['estimated_new_price'])}")
                    print(f"  Ecart       : {_format_diff(ad_data['price'], ad_data['estimated_new_price'])}")

                accessories = ad_data.get("accessories", [])
                if accessories:
                    valuation = estimate_total_accessories_value(accessories)
                    print(f"  Accessoires ({len(accessories)}) - Valeur neuf: {_format_price(valuation['total_new_price'])} / Occasion: ~{_format_price(valuation['total_used_price'])} :")
                    for i, acc in enumerate(accessories, 1):
                        print(f"    {i}. [{acc['category']:>11}] {acc['name']:<40} (neuf ~{acc['estimated_new_price']} EUR)")
                else:
                    print("  Accessoires : Aucun detecte")

                if ad_data.get("price") and accessories:
                    valuation = estimate_total_accessories_value(accessories)
                    adjusted = ad_data["price"] - valuation["total_used_price"]
                    print(f"\n  >> Prix moto seule (estime) : {_format_price(adjusted)}  (prix annonce - valeur accessoires occasion)")
                    if ad_data.get("estimated_new_price"):
                        diff_adjusted = adjusted - ad_data["estimated_new_price"]
                        pct_adjusted = (diff_adjusted / ad_data["estimated_new_price"]) * 100
                        print(f"  >> Ecart vs neuf (moto seule): {diff_adjusted:+,.0f} EUR ({pct_adjusted:+.1f}%)".replace(",", " "))

                ad_data = _confirm_extraction(ad_data)
                if ad_data is None:
                    print("  >> Annonce ignoree.")
                    continue

                ad_id = upsert_ad(session, ad_data)
                print(f"\n  Stocke en base (ID: {ad_id})")

            except Exception as e:
                print(f"  ERREUR : {e}")

        total = get_ad_count(session)
    print(f"\n{'='*60}")
    print(f"Total annonces en base : {total}")


def cmd_list() -> None:
    """Liste toutes les annonces stockees."""
    with Session(engine) as session:
        ads = get_all_ads(session)

    if not ads:
        print("Aucune annonce en base. Utilisez 'python main.py add <url>' pour en ajouter.")
        return

    print(f"\n{'ID':<12} {'Prix':>10} {'An.':>5} {'Km':>8} {'Variante':<12} {'Couleur':<25} {'Acc.':>4}  {'Ville':<20} {'Titre'}")
    print("-" * 130)

    for ad in ads:
        acc_count = len(ad.get("accessories", []))
        print(
            f"{ad['id']:<12} "
            f"{_format_price(ad['price']):>10} "
            f"{ad.get('year', '?'):>5} "
            f"{str(ad.get('mileage_km', '?')):>8} "
            f"{(ad.get('variant') or '?'):<12} "
            f"{(ad.get('color') or '?'):<25} "
            f"{acc_count:>4}  "
            f"{(ad.get('city') or '?'):<20} "
            f"{(ad.get('subject') or '')[:50]}"
        )

    print(f"\nTotal : {len(ads)} annonce(s)")


def cmd_show(ad_id: str) -> None:
    """Affiche le detail d'une annonce."""
    with Session(engine) as session:
        ad = session.get(Ad, int(ad_id))
        if not ad:
            print(f"Annonce {ad_id} non trouvee.")
            return

        print(f"\n{'='*60}")
        print(f"  {ad.subject}")
        print(f"{'='*60}")
        print(f"  URL           : {ad.url}")
        print(f"  Prix          : {_format_price(ad.price)}")
        print(f"  Annee         : {ad.year or 'N/A'}")
        print(f"  Kilometrage   : {ad.mileage_km or 'N/A'} km")
        print(f"  Cylindree     : {ad.engine_size_cc or 'N/A'} cc")
        print(f"  Carburant     : {ad.fuel_type or 'N/A'}")
        print(f"  Couleur       : {ad.color or 'N/A'}")
        print(f"  Variante      : {ad.variant or 'Non detectee'}")
        print(f"  Jantes        : {ad.wheel_type or 'N/A'}")
        print(f"  Vendeur       : {ad.seller_type or 'N/A'}")
        print(f"  Localisation  : {ad.city or '?'}, {ad.zipcode or '?'} ({ad.department or '?'})")
        print(f"  Publication   : {ad.first_publication_date or 'N/A'}")

        if ad.estimated_new_price:
            print(f"  Prix neuf ref : {_format_price(ad.estimated_new_price)}")
            print(f"  Ecart neuf    : {_format_diff(ad.price, ad.estimated_new_price)}")

        # Attributs
        attrs = session.exec(
            select(AdAttribute).where(AdAttribute.ad_id == ad.id).order_by(AdAttribute.key)
        ).all()
        if attrs:
            print(f"\n  Attributs LBC ({len(attrs)}) :")
            for a in attrs:
                label = a.value_label or a.value or ""
                print(f"    {a.key:<25} : {label}")

        # Accessoires
        accessories = session.exec(
            select(AdAccessory).where(AdAccessory.ad_id == ad.id).order_by(AdAccessory.category, AdAccessory.name)
        ).all()
        if accessories:
            total_new = sum(a.estimated_new_price or 0 for a in accessories)
            total_used = sum(a.estimated_used_price or 0 for a in accessories)
            print(f"\n  Accessoires detectes ({len(accessories)}) — Valeur neuf: {_format_price(total_new)} / Occasion: ~{_format_price(total_used)}")
            current_cat = None
            for a in accessories:
                if a.category != current_cat:
                    current_cat = a.category
                    print(f"    [{current_cat}]")
                price_str = f"~{a.estimated_new_price} EUR neuf" if a.estimated_new_price else ""
                print(f"      - {a.name:<40} {price_str}")

            if ad.price and total_used > 0:
                adjusted = ad.price - total_used
                print(f"\n  >> Prix moto seule (estime) : {_format_price(adjusted)}")
                if ad.estimated_new_price:
                    diff_adj = adjusted - ad.estimated_new_price
                    pct_adj = (diff_adj / ad.estimated_new_price) * 100
                    print(f"  >> Ecart vs neuf (moto seule): {diff_adj:+,.0f} EUR ({pct_adj:+.1f}%)".replace(",", " "))

        # Images
        images = session.exec(
            select(AdImage).where(AdImage.ad_id == ad.id).order_by(AdImage.position)
        ).all()
        if images:
            print(f"\n  Images ({len(images)}) :")
            for img in images:
                print(f"    {img.url}")

        # Description
        if ad.body:
            print(f"\n  Description :")
            print(f"  {'-'*50}")
            for line in ad.body.splitlines():
                print(f"    {line}")


def cmd_stats() -> None:
    """Affiche des statistiques sur les annonces stockees."""
    with Session(engine) as session:
        ads = get_all_ads(session)

    if not ads:
        print("Aucune annonce en base.")
        return

    prices = [a["price"] for a in ads if a["price"] is not None]
    years = [a["year"] for a in ads if a["year"] is not None]
    kms = [a["mileage_km"] for a in ads if a["mileage_km"] is not None]

    print(f"\n{'='*60}")
    print(f"  STATISTIQUES - {len(ads)} annonce(s)")
    print(f"{'='*60}")

    if prices:
        print(f"\n  Prix :")
        print(f"    Min     : {_format_price(min(prices))}")
        print(f"    Max     : {_format_price(max(prices))}")
        print(f"    Moyenne : {_format_price(sum(prices)/len(prices))}")
        print(f"    Mediane : {_format_price(sorted(prices)[len(prices)//2])}")

    if years:
        print(f"\n  Annees : {min(years)} - {max(years)}")

    if kms:
        print(f"\n  Kilometrage :")
        print(f"    Min     : {min(kms):,} km".replace(",", " "))
        print(f"    Max     : {max(kms):,} km".replace(",", " "))
        print(f"    Moyenne : {sum(kms)//len(kms):,} km".replace(",", " "))

    variants = {}
    for a in ads:
        v = a.get("variant") or "Non detectee"
        variants[v] = variants.get(v, 0) + 1
    if variants:
        print(f"\n  Repartition par variante :")
        for v, count in sorted(variants.items(), key=lambda x: -x[1]):
            bar = "#" * count
            print(f"    {v:<15} : {count:>3}  {bar}")

    depts = {}
    for a in ads:
        d = a.get("department") or "Inconnu"
        depts[d] = depts.get(d, 0) + 1
    if depts:
        print(f"\n  Top 10 departements :")
        for d, count in sorted(depts.items(), key=lambda x: -x[1])[:10]:
            print(f"    {d:<25} : {count}")

    all_acc = {}
    for a in ads:
        for acc in a.get("accessories", []):
            name = acc["name"]
            all_acc[name] = all_acc.get(name, 0) + 1
    if all_acc:
        print(f"\n  Top 10 accessoires les plus frequents :")
        for name, count in sorted(all_acc.items(), key=lambda x: -x[1])[:10]:
            pct = count / len(ads) * 100
            print(f"    {name:<35} : {count:>3} ({pct:.0f}%)")


def cmd_export() -> None:
    """Exporte toutes les annonces en CSV."""
    with Session(engine) as session:
        ads = get_all_ads(session)

    if not ads:
        print("Aucune annonce a exporter.")
        return

    output = Path(__file__).resolve().parent / "export_annonces.csv"
    fieldnames = [
        "id", "url", "subject", "price", "year", "mileage_km",
        "engine_size_cc", "color", "variant", "wheel_type",
        "estimated_new_price", "ecart_neuf", "city", "zipcode",
        "department", "seller_type", "first_publication_date",
        "nb_accessories", "accessories_list",
    ]

    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        writer.writeheader()

        for ad in ads:
            acc_names = [a["name"] for a in ad.get("accessories", [])]
            ecart = None
            if ad.get("price") and ad.get("estimated_new_price"):
                ecart = ad["price"] - ad["estimated_new_price"]

            writer.writerow({
                "id": ad["id"], "url": ad["url"], "subject": ad["subject"],
                "price": ad["price"], "year": ad.get("year"),
                "mileage_km": ad.get("mileage_km"),
                "engine_size_cc": ad.get("engine_size_cc"),
                "color": ad.get("color"), "variant": ad.get("variant"),
                "wheel_type": ad.get("wheel_type"),
                "estimated_new_price": ad.get("estimated_new_price"),
                "ecart_neuf": ecart,
                "city": ad.get("city"), "zipcode": ad.get("zipcode"),
                "department": ad.get("department"),
                "seller_type": ad.get("seller_type"),
                "first_publication_date": ad.get("first_publication_date"),
                "nb_accessories": len(acc_names),
                "accessories_list": ", ".join(acc_names),
            })

    print(f"Export termine : {output}")
    print(f"{len(ads)} annonce(s) exportee(s).")


def main():
    run_migrations()

    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "add":
        if len(sys.argv) < 3:
            print("Usage: python main.py add <url> [<url2> ...]")
            sys.exit(1)
        cmd_add(sys.argv[2:])
    elif command == "list":
        cmd_list()
    elif command == "show":
        if len(sys.argv) < 3:
            print("Usage: python main.py show <id>")
            sys.exit(1)
        cmd_show(sys.argv[2])
    elif command == "stats":
        cmd_stats()
    elif command == "export":
        cmd_export()
    else:
        print(f"Commande inconnue : {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
