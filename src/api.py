"""
API REST FastAPI pour le frontend Himalayan 450 Analyzer.

Expose les fonctions existantes (database, extractor, analyzer) via des endpoints JSON.
"""

import csv
import io
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .database import get_connection, init_db, upsert_ad, get_all_ads, get_ad_count, get_accessory_overrides, set_accessory_override, delete_accessory_override, refresh_accessories
from .analyzer import rank_ads
from .accessories import estimate_total_accessories_value, ACCESSORY_PATTERNS, DEPRECIATION_RATE

app = FastAPI(title="Himalayan 450 Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_db():
    conn = get_connection()
    init_db(conn)
    return conn


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AddAdRequest(BaseModel):
    url: str


class ConfirmAdRequest(BaseModel):
    """Donnees d'annonce validees par l'utilisateur apres preview."""
    ad_data: dict


class UpdateAdRequest(BaseModel):
    """Champs modifiables d'une annonce existante."""
    color: str | None = None
    variant: str | None = None
    wheel_type: str | None = None
    accessories: list[dict] | None = None
    sold: int | None = None


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/api/ads")
def list_ads(
    variant: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Liste les annonces avec filtres optionnels."""
    conn = _get_db()
    ads = get_all_ads(conn)
    conn.close()

    # Filtrage
    if variant:
        ads = [a for a in ads if a.get("variant") == variant]
    if min_price is not None:
        ads = [a for a in ads if (a.get("price") or 0) >= min_price]
    if max_price is not None:
        ads = [a for a in ads if (a.get("price") or 0) <= max_price]

    total = len(ads)
    ads = ads[offset:offset + limit]

    return {"total": total, "ads": ads}


@app.get("/api/ads/{ad_id}")
def get_ad(ad_id: int):
    """Detail complet d'une annonce."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM ads WHERE id = ?", (ad_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    ad = dict(row)

    # Accessoires
    ad["accessories"] = [
        dict(r) for r in conn.execute(
            "SELECT name, category, source, estimated_new_price, estimated_used_price "
            "FROM ad_accessories WHERE ad_id = ? ORDER BY category, name",
            (ad_id,),
        ).fetchall()
    ]

    # Images
    ad["images"] = [
        r["url"] for r in conn.execute(
            "SELECT url FROM ad_images WHERE ad_id = ? ORDER BY position",
            (ad_id,),
        ).fetchall()
    ]

    # Attributs
    ad["attributes"] = [
        dict(r) for r in conn.execute(
            "SELECT key, value, value_label FROM ad_attributes WHERE ad_id = ? ORDER BY key",
            (ad_id,),
        ).fetchall()
    ]

    conn.close()
    return ad


@app.post("/api/ads/preview")
def preview_ad(req: AddAdRequest):
    """Extrait une annonce sans la sauvegarder, pour verification par l'utilisateur."""
    from .extractor import fetch_ad
    import lbc as lbc_lib

    conn = _get_db()
    overrides = get_accessory_overrides(conn)
    conn.close()

    try:
        client = lbc_lib.Client()
        ad_data = fetch_ad(req.url, client=client, price_overrides=overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur extraction : {e}")

    return ad_data


@app.post("/api/ads/confirm")
def confirm_ad(req: ConfirmAdRequest):
    """Sauvegarde une annonce apres verification/modification par l'utilisateur."""
    from .extractor import _estimate_new_price

    ad_data = req.ad_data

    if not ad_data.get("id"):
        raise HTTPException(status_code=400, detail="Donnees d'annonce invalides (id manquant)")

    # Recalculer le prix neuf si variante/couleur/jantes ont change
    new_price = _estimate_new_price(
        ad_data.get("variant"), ad_data.get("color"), ad_data.get("wheel_type")
    )
    if new_price:
        ad_data["estimated_new_price"] = new_price

    conn = _get_db()
    ad_id = upsert_ad(conn, ad_data)
    conn.close()

    return {"id": ad_id, "subject": ad_data.get("subject"), "price": ad_data.get("price")}


@app.post("/api/ads")
def add_ad(req: AddAdRequest):
    """Ajoute une annonce via URL LeBonCoin (sans preview)."""
    from .extractor import fetch_ad
    import lbc as lbc_lib

    conn_tmp = _get_db()
    overrides = get_accessory_overrides(conn_tmp)
    conn_tmp.close()

    try:
        client = lbc_lib.Client()
        ad_data = fetch_ad(req.url, client=client, price_overrides=overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur extraction : {e}")

    conn = _get_db()
    ad_id = upsert_ad(conn, ad_data)
    conn.close()

    return {"id": ad_id, "subject": ad_data.get("subject"), "price": ad_data.get("price")}


@app.delete("/api/ads/{ad_id}")
def delete_ad(ad_id: int):
    """Supprime une annonce."""
    conn = _get_db()
    row = conn.execute("SELECT id FROM ads WHERE id = ?", (ad_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    conn.execute("DELETE FROM ads WHERE id = ?", (ad_id,))
    conn.commit()
    conn.close()
    return {"deleted": ad_id}


@app.patch("/api/ads/{ad_id}")
def update_ad(ad_id: int, req: UpdateAdRequest):
    """Met a jour les champs modifiables d'une annonce (couleur, variante, accessoires)."""
    from .extractor import _estimate_new_price

    conn = _get_db()
    row = conn.execute("SELECT * FROM ads WHERE id = ?", (ad_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    updates = []
    params = []

    current = dict(row)
    new_variant = req.variant if req.variant is not None else current["variant"]
    new_color = req.color if req.color is not None else current["color"]
    new_wheel = req.wheel_type if req.wheel_type is not None else current["wheel_type"]

    if req.color is not None:
        updates.append("color = ?")
        params.append(req.color)
    if req.variant is not None:
        updates.append("variant = ?")
        params.append(req.variant)
    if req.wheel_type is not None:
        updates.append("wheel_type = ?")
        params.append(req.wheel_type)
    if req.sold is not None:
        updates.append("sold = ?")
        params.append(req.sold)

    # Recalculer le prix neuf si variante/couleur/jantes modifiees
    if req.variant is not None or req.color is not None or req.wheel_type is not None:
        new_price = _estimate_new_price(new_variant, new_color, new_wheel)
        if new_price:
            updates.append("estimated_new_price = ?")
            params.append(new_price)

    if updates:
        updates.append("updated_at = datetime('now')")
        params.append(ad_id)
        conn.execute(f"UPDATE ads SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    # Mise a jour des accessoires
    if req.accessories is not None:
        conn.execute("DELETE FROM ad_accessories WHERE ad_id = ?", (ad_id,))
        for acc in req.accessories:
            conn.execute(
                "INSERT OR IGNORE INTO ad_accessories (ad_id, name, category, source, estimated_new_price, estimated_used_price) VALUES (?, ?, ?, ?, ?, ?)",
                (ad_id, acc["name"], acc.get("category"), acc.get("source"),
                 acc.get("estimated_new_price", 0), acc.get("estimated_used_price", 0)),
            )
        # Marquer comme modifie manuellement
        conn.execute("UPDATE ads SET accessories_manual = 1 WHERE id = ?", (ad_id,))
        conn.commit()

    conn.close()
    return {"updated": ad_id}


# ─── Merge / Price History ──────────────────────────────────────────────────


class MergeAdRequest(BaseModel):
    """Fusionne une nouvelle annonce crawlee avec une ancienne en base."""
    new_ad_data: dict       # donnees extraites de la nouvelle annonce
    old_ad_id: int          # annonce existante a remplacer


@app.post("/api/ads/merge")
def merge_ad(req: MergeAdRequest):
    """
    Fusionne une nouvelle annonce (repost) avec une ancienne en base.

    1. Enregistre le prix de l'ancienne annonce dans l'historique
    2. Enregistre le prix de la nouvelle annonce dans l'historique
    3. Marque l'ancienne annonce comme vendue
    4. Sauvegarde la nouvelle annonce avec un lien vers l'ancienne
    5. Copie l'historique de prix de l'ancienne vers la nouvelle
    """
    from .extractor import _estimate_new_price

    conn = _get_db()
    old_row = conn.execute("SELECT * FROM ads WHERE id = ?", (req.old_ad_id,)).fetchone()
    if not old_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Ancienne annonce non trouvee")

    old_ad = dict(old_row)
    new_data = req.new_ad_data

    if not new_data.get("id"):
        conn.close()
        raise HTTPException(status_code=400, detail="Donnees d'annonce invalides (id manquant)")

    new_id = new_data["id"]
    old_price = old_ad.get("price") or 0
    new_price_val = new_data.get("price") or 0

    # Recalculer le prix neuf si besoin
    estimated = _estimate_new_price(
        new_data.get("variant"), new_data.get("color"), new_data.get("wheel_type")
    )
    if estimated:
        new_data["estimated_new_price"] = estimated

    # Lier la nouvelle annonce a l'ancienne
    new_data["previous_ad_id"] = req.old_ad_id

    # Sauvegarder la nouvelle annonce
    ad_id = upsert_ad(conn, new_data)

    # Verifier si l'ancienne annonce avait deja un historique de prix
    old_history = conn.execute(
        "SELECT previous_ad_id, price, source, note, recorded_at FROM ad_price_history WHERE ad_id = ?",
        (req.old_ad_id,),
    ).fetchall()

    # Date de publication de l'ancienne annonce (pour l'entree initiale)
    old_pub_date = old_ad.get("first_publication_date") or old_ad.get("extracted_at")
    # Date de publication de la nouvelle annonce (pour l'entree repost)
    new_pub_date = new_data.get("first_publication_date") or new_data.get("extracted_at")

    if old_history:
        # Copier l'historique existant vers la nouvelle annonce
        for h in old_history:
            conn.execute(
                "INSERT INTO ad_price_history (ad_id, previous_ad_id, price, source, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                (ad_id, h["previous_ad_id"], h["price"], h["source"], h["note"], h["recorded_at"]),
            )
    elif old_price:
        # Pas d'historique existant : creer l'entree initiale a partir de l'ancien prix
        # previous_ad_id = NULL car c'est le point de depart de la timeline
        conn.execute(
            "INSERT INTO ad_price_history (ad_id, previous_ad_id, price, source, note, recorded_at) VALUES (?, NULL, ?, 'initial', ?, ?)",
            (ad_id, old_price, f"Annonce #{req.old_ad_id}", old_pub_date),
        )

    # Enregistrer le nouveau prix (repost)
    # previous_ad_id = l'annonce qu'on remplace (old_ad_id)
    price_delta = int(new_price_val - old_price) if (old_price and new_price_val) else 0
    note = f"Annonce #{new_id}"
    if price_delta < 0:
        note += f" — baisse de {abs(price_delta)}€ vs #{req.old_ad_id}"
    elif price_delta > 0:
        note += f" — hausse de {price_delta}€ vs #{req.old_ad_id}"
    else:
        note += f" — meme prix que #{req.old_ad_id}"

    conn.execute(
        "INSERT INTO ad_price_history (ad_id, previous_ad_id, price, source, note, recorded_at) VALUES (?, ?, ?, 'repost', ?, ?)",
        (ad_id, req.old_ad_id, new_price_val, note, new_pub_date),
    )

    # Marquer l'ancienne annonce comme vendue et superseded
    conn.execute(
        "UPDATE ads SET sold = 1, superseded_by = ?, updated_at = datetime('now') WHERE id = ?",
        (ad_id, req.old_ad_id),
    )

    conn.commit()
    conn.close()

    return {
        "id": ad_id,
        "old_ad_id": req.old_ad_id,
        "price_delta": price_delta,
        "subject": new_data.get("subject"),
    }


@app.get("/api/ads/{ad_id}/price-history")
def get_price_history(ad_id: int):
    """Retourne l'historique des prix d'une annonce (inclut les reposts)."""
    conn = _get_db()
    row = conn.execute("SELECT id, price, previous_ad_id FROM ads WHERE id = ?", (ad_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    history = [
        dict(r) for r in conn.execute(
            "SELECT * FROM ad_price_history WHERE ad_id = ? ORDER BY recorded_at ASC",
            (ad_id,),
        ).fetchall()
    ]

    conn.close()

    return {
        "ad_id": ad_id,
        "current_price": row["price"],
        "previous_ad_id": row["previous_ad_id"],
        "history": history,
    }


@app.get("/api/accessory-catalog")
def get_accessory_catalog():
    """Retourne le catalogue complet des accessoires detectables, avec surcharges utilisateur."""
    conn = _get_db()
    overrides = get_accessory_overrides(conn)
    conn.close()

    seen_groups: set[str] = set()
    catalog = []
    for _pattern, name, category, price_new, group in ACCESSORY_PATTERNS:
        if group not in seen_groups:
            seen_groups.add(group)
            effective_price = overrides.get(group, price_new)
            catalog.append({
                "name": name,
                "category": category,
                "estimated_new_price": effective_price,
                "default_new_price": price_new,
                "estimated_used_price": int(effective_price * DEPRECIATION_RATE),
                "group": group,
                "has_override": group in overrides,
            })
    return catalog


class UpdateCatalogPriceRequest(BaseModel):
    estimated_new_price: int


@app.patch("/api/accessory-catalog/{group}")
def update_catalog_price(group: str, req: UpdateCatalogPriceRequest):
    """Met a jour le prix neuf d'un groupe d'accessoires et propage aux annonces existantes."""
    # Verifier que le groupe existe
    valid_groups = {g for _, _, _, _, g in ACCESSORY_PATTERNS}
    if group not in valid_groups:
        raise HTTPException(status_code=404, detail=f"Groupe '{group}' inconnu")

    conn = _get_db()
    set_accessory_override(conn, group, req.estimated_new_price)

    # Propager aux annonces existantes
    results = refresh_accessories(conn)
    conn.close()

    return {"group": group, "estimated_new_price": req.estimated_new_price, "ads_refreshed": len(results)}


@app.delete("/api/accessory-catalog/{group}/override")
def reset_catalog_price(group: str):
    """Supprime la surcharge et revient au prix par defaut."""
    valid_groups = {g for _, _, _, _, g in ACCESSORY_PATTERNS}
    if group not in valid_groups:
        raise HTTPException(status_code=404, detail=f"Groupe '{group}' inconnu")

    conn = _get_db()
    delete_accessory_override(conn, group)

    # Propager aux annonces existantes
    results = refresh_accessories(conn)
    conn.close()

    return {"group": group, "reset": True, "ads_refreshed": len(results)}


@app.post("/api/accessories/refresh")
def refresh_all_accessories():
    """Re-detecte les accessoires de toutes les annonces non editees manuellement."""
    conn = _get_db()
    # Compter les annonces ignorees (manuelles)
    skipped = conn.execute("SELECT COUNT(*) FROM ads WHERE accessories_manual = 1").fetchone()[0]
    results = refresh_accessories(conn, skip_manual=True)
    conn.close()
    return {
        "ads_refreshed": len(results),
        "ads_skipped_manual": skipped,
        "details": results,
    }


@app.post("/api/ads/{ad_id}/refresh-accessories")
def refresh_ad_accessories(ad_id: int):
    """Re-detecte les accessoires d'une annonce specifique (reset le flag manuel)."""
    conn = _get_db()
    row = conn.execute("SELECT id FROM ads WHERE id = ?", (ad_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    # Reset le flag manuel puisque l'utilisateur demande explicitement le refresh
    conn.execute("UPDATE ads SET accessories_manual = 0 WHERE id = ?", (ad_id,))
    conn.commit()

    results = refresh_accessories(conn, ad_ids=[ad_id])
    conn.close()

    detail = results[0] if results else {"id": ad_id, "before": 0, "after": 0}
    return detail


@app.post("/api/ads/check-online")
def check_ads_online():
    """
    Verifie si les annonces non vendues sont toujours en ligne sur LeBonCoin.
    Si une annonce n'est plus accessible, elle est marquee comme vendue.
    """
    import lbc as lbc_lib

    conn = _get_db()
    rows = conn.execute("SELECT id, url FROM ads WHERE sold = 0").fetchall()

    client = lbc_lib.Client()
    results = []

    for row in rows:
        ad_id = row["id"]
        try:
            ad = client.get_ad(ad_id)
            # Verifier le statut LBC
            ad_status = getattr(ad, "status", None)
            if ad_status and ad_status not in ("active",):
                conn.execute("UPDATE ads SET sold = 1, updated_at = datetime('now') WHERE id = ?", (ad_id,))
                results.append({"id": ad_id, "sold": True, "reason": f"status={ad_status}"})
            else:
                results.append({"id": ad_id, "sold": False})
        except Exception:
            # Annonce inaccessible = probablement vendue/supprimee
            conn.execute("UPDATE ads SET sold = 1, updated_at = datetime('now') WHERE id = ?", (ad_id,))
            results.append({"id": ad_id, "sold": True, "reason": "inaccessible"})

    conn.commit()
    conn.close()

    newly_sold = sum(1 for r in results if r["sold"])
    return {
        "checked": len(results),
        "newly_sold": newly_sold,
        "details": results,
    }


@app.post("/api/ads/{ad_id}/check-online")
def check_ad_online(ad_id: int):
    """Verifie si une annonce est toujours en ligne sur LeBonCoin."""
    import lbc as lbc_lib

    conn = _get_db()
    row = conn.execute("SELECT id FROM ads WHERE id = ?", (ad_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    client = lbc_lib.Client()
    try:
        ad = client.get_ad(ad_id)
        ad_status = getattr(ad, "status", None)
        if ad_status and ad_status not in ("active",):
            conn.execute("UPDATE ads SET sold = 1, updated_at = datetime('now') WHERE id = ?", (ad_id,))
            conn.commit()
            conn.close()
            return {"id": ad_id, "sold": True, "reason": f"status={ad_status}"}
        conn.close()
        return {"id": ad_id, "sold": False}
    except Exception:
        conn.execute("UPDATE ads SET sold = 1, updated_at = datetime('now') WHERE id = ?", (ad_id,))
        conn.commit()
        conn.close()
        return {"id": ad_id, "sold": True, "reason": "inaccessible"}


@app.get("/api/stats")
def get_stats():
    """Statistiques agregees."""
    conn = _get_db()
    ads = get_all_ads(conn)
    conn.close()

    prices = [a["price"] for a in ads if a["price"] is not None]
    kms = [a["mileage_km"] for a in ads if a["mileage_km"] is not None]
    years = [a["year"] for a in ads if a["year"] is not None]

    # Variantes
    variants = {}
    for a in ads:
        v = a.get("variant") or "Non detectee"
        variants[v] = variants.get(v, 0) + 1

    # Departements
    depts = {}
    for a in ads:
        d = a.get("department") or "Inconnu"
        depts[d] = depts.get(d, 0) + 1

    # Accessoires
    all_acc = {}
    for a in ads:
        for acc in a.get("accessories", []):
            name = acc["name"]
            all_acc[name] = all_acc.get(name, 0) + 1

    top_accessories = [
        {"name": name, "count": count, "pct": round(count / len(ads) * 100, 1) if ads else 0}
        for name, count in sorted(all_acc.items(), key=lambda x: -x[1])[:15]
    ]

    sorted_prices = sorted(prices) if prices else []

    return {
        "count": len(ads),
        "price": {
            "min": min(prices) if prices else None,
            "max": max(prices) if prices else None,
            "mean": round(sum(prices) / len(prices), 0) if prices else None,
            "median": sorted_prices[len(sorted_prices) // 2] if sorted_prices else None,
        },
        "mileage": {
            "min": min(kms) if kms else None,
            "max": max(kms) if kms else None,
            "mean": round(sum(kms) / len(kms), 0) if kms else None,
        },
        "years": {"min": min(years) if years else None, "max": max(years) if years else None},
        "variants": [{"name": v, "count": c} for v, c in sorted(variants.items(), key=lambda x: -x[1])],
        "departments": [{"name": d, "count": c} for d, c in sorted(depts.items(), key=lambda x: -x[1])[:15]],
        "top_accessories": top_accessories,
        "prices_list": sorted_prices,
        "mileages_list": sorted(kms) if kms else [],
    }


@app.get("/api/rankings")
def get_rankings():
    """Classement par decote."""
    return rank_ads()


# ─── Crawl ──────────────────────────────────────────────────────────────────


class ExtractRequest(BaseModel):
    """Demande d'extraction d'une annonce pour le crawl."""
    ad_id: int
    url: str


@app.get("/api/crawl/search")
def crawl_search():
    """Lance la recherche LeBonCoin, sauvegarde une session, et retourne les resultats."""
    from .crawler import search_all_ads

    try:
        results = search_all_ads()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur recherche LeBonCoin : {e}")

    conn = _get_db()

    # Marquer les annonces deja en base
    existing_ids = {
        row["id"]
        for row in conn.execute("SELECT id FROM ads").fetchall()
    }

    # Charger toutes les annonces en base pour detection legere de doublons
    db_ads = [
        dict(r) for r in conn.execute(
            "SELECT id, city, department, price, subject, sold FROM ads"
        ).fetchall()
    ]

    for ad in results["ads"]:
        ad["exists_in_db"] = ad["id"] in existing_ids

        # Detection legere : meme ville + prix ±15% (strict pour eviter faux positifs)
        ad["possible_repost_of"] = None
        if ad["id"] not in existing_ids:
            new_city = (ad.get("city") or "").lower().strip()
            new_price = ad.get("price") or 0
            best_match = None
            best_score = 0
            for db_ad in db_ads:
                s_city = (db_ad.get("city") or "").lower().strip()
                if not (s_city and new_city and s_city == new_city):
                    continue
                s_price = db_ad.get("price") or 0
                if not (new_price and s_price):
                    continue
                ratio = abs(new_price - s_price) / max(new_price, s_price)
                if ratio > 0.15:
                    continue
                score = 55  # ville + prix match
                if db_ad.get("sold"):
                    score += 15  # forte indication
                if score > best_score:
                    best_score = score
                    price_delta = int(new_price - s_price)
                    best_match = {
                        "id": db_ad["id"],
                        "subject": db_ad.get("subject"),
                        "price": db_ad.get("price"),
                        "city": db_ad.get("city"),
                        "sold": bool(db_ad.get("sold", 0)),
                        "price_delta": price_delta,
                    }
            if best_match:
                ad["possible_repost_of"] = best_match

    # Clore les sessions actives precedentes
    conn.execute("UPDATE crawl_sessions SET status = 'done' WHERE status = 'active'")

    # Creer une nouvelle session
    cursor = conn.execute(
        "INSERT INTO crawl_sessions (status, total_ads) VALUES ('active', ?)",
        (len(results["ads"]),),
    )
    session_id = cursor.lastrowid

    # Sauvegarder les annonces de la session
    for i, ad in enumerate(results["ads"]):
        conn.execute(
            "INSERT INTO crawl_session_ads (session_id, ad_id, url, subject, price, city, department, thumbnail, exists_in_db, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (session_id, ad["id"], ad["url"], ad.get("subject"), ad.get("price"),
             ad.get("city"), ad.get("department"), ad.get("thumbnail"),
             1 if ad.get("exists_in_db") else 0, i),
        )

    conn.commit()
    conn.close()

    return {**results, "session_id": session_id}


@app.get("/api/crawl/sessions/active")
def get_active_crawl_session():
    """Retourne la session de crawl active (la plus recente), ou null."""
    conn = _get_db()

    session = conn.execute(
        "SELECT * FROM crawl_sessions WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
    ).fetchone()

    if not session:
        conn.close()
        return None

    session_id = session["id"]

    # Re-verifier exists_in_db (des annonces ont pu etre ajoutees entre-temps)
    existing_ids = {
        row["id"]
        for row in conn.execute("SELECT id FROM ads").fetchall()
    }

    rows = conn.execute(
        "SELECT * FROM crawl_session_ads WHERE session_id = ? ORDER BY position",
        (session_id,),
    ).fetchall()

    ads = []
    for row in rows:
        ad = dict(row)
        ad["exists_in_db"] = ad["ad_id"] in existing_ids
        ads.append({
            "id": ad["ad_id"],
            "url": ad["url"],
            "subject": ad["subject"],
            "price": ad["price"],
            "city": ad["city"],
            "department": ad["department"],
            "thumbnail": ad["thumbnail"],
            "exists_in_db": ad["exists_in_db"],
            "action": ad["action"],
        })

    conn.close()

    return {
        "session_id": session["id"],
        "status": session["status"],
        "total_ads": session["total_ads"],
        "created_at": session["created_at"],
        "ads": ads,
    }


class UpdateCrawlAdAction(BaseModel):
    action: str  # 'confirmed', 'skipped', 'error'


@app.patch("/api/crawl/sessions/{session_id}/ads/{ad_id}")
def update_crawl_session_ad(session_id: int, ad_id: int, req: UpdateCrawlAdAction):
    """Met a jour le statut d'une annonce dans une session de crawl."""
    if req.action not in ('confirmed', 'skipped', 'error'):
        raise HTTPException(status_code=400, detail="Action invalide")

    conn = _get_db()
    conn.execute(
        "UPDATE crawl_session_ads SET action = ? WHERE session_id = ? AND ad_id = ?",
        (req.action, session_id, ad_id),
    )

    # Verifier si toutes les annonces sont traitees
    pending = conn.execute(
        "SELECT COUNT(*) FROM crawl_session_ads WHERE session_id = ? AND action = 'pending'",
        (session_id,),
    ).fetchone()[0]

    if pending == 0:
        conn.execute("UPDATE crawl_sessions SET status = 'done' WHERE id = ?", (session_id,))

    conn.commit()
    conn.close()
    return {"updated": True}


@app.delete("/api/crawl/sessions/{session_id}")
def close_crawl_session(session_id: int):
    """Cloture une session de crawl."""
    conn = _get_db()
    conn.execute("UPDATE crawl_sessions SET status = 'done' WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()
    return {"closed": session_id}


@app.delete("/api/crawl/sessions/{session_id}/ads/{ad_id}")
def remove_crawl_session_ad(session_id: int, ad_id: int):
    """Retire une annonce d'une session de crawl."""
    conn = _get_db()
    conn.execute(
        "DELETE FROM crawl_session_ads WHERE session_id = ? AND ad_id = ?",
        (session_id, ad_id),
    )
    # Mettre a jour le total
    remaining = conn.execute(
        "SELECT COUNT(*) FROM crawl_session_ads WHERE session_id = ?",
        (session_id,),
    ).fetchone()[0]
    conn.execute(
        "UPDATE crawl_sessions SET total_ads = ? WHERE id = ?",
        (remaining, session_id),
    )
    conn.commit()
    conn.close()
    return {"removed": ad_id}


def _extract_significant_words(text: str, min_len: int = 4) -> set[str]:
    """Extrait les mots significatifs d'un texte (>= min_len chars, lowercase)."""
    import re
    if not text:
        return set()
    words = re.findall(r'[a-zà-ÿ0-9]+', text.lower())
    stopwords = {
        "dans", "avec", "pour", "plus", "tres", "tout", "aussi", "bien",
        "mais", "comme", "cette", "sont", "sera", "moto", "vente", "etat",
        "royal", "enfield", "himalayan", "annonce", "vends", "bonjour",
        "merci", "prix", "euros", "cause", "neuf", "neuve", "occasion",
        "kilometres", "premiere", "main", "excellent", "parfait",
    }
    return {w for w in words if len(w) >= min_len and w not in stopwords}


def _find_potential_duplicates(conn, ad_data: dict, exclude_id: int) -> list[dict]:
    """
    Cherche les annonces en base qui pourraient etre un repost de l'annonce crawlee.

    Approche stricte : toutes les annonces sont des Himalayan 450, donc variante/couleur
    seules ne suffisent pas. On exige une convergence de signaux forts :
      - Meme ville obligatoire (pas juste departement)
      - Prix proche (±15%)
      - Description tres similaire (Jaccard >= 0.3 sur mots significatifs)
      - OU accessoires tres similaires (Jaccard >= 0.5)
      - Bonus si annonce vendue

    Scoring :
      - Meme ville : +35 (prerequis quasi-obligatoire)
      - Prix ±15% : +20, prix ±5% : +10 bonus
      - Description Jaccard >= 0.3 : +25, >= 0.5 : +10 bonus
      - Accessoires Jaccard >= 0.5 : +20, >= 0.75 : +10 bonus
      - Meme kilometrage ±1000km : +15
      - Annonce vendue : +10
      - Meme couleur : +5 (faible — beaucoup de motos meme couleur)

    Seuil : 80 pts minimum. On prefere rater un doublon que signaler un faux positif.
    """
    rows = conn.execute(
        "SELECT * FROM ads WHERE id != ?", (exclude_id,)
    ).fetchall()

    # Pre-charger accessoires
    all_acc_rows = conn.execute("SELECT ad_id, name FROM ad_accessories").fetchall()
    acc_by_ad: dict[int, set[str]] = {}
    for r in all_acc_rows:
        acc_by_ad.setdefault(r["ad_id"], set()).add(r["name"])

    new_price = ad_data.get("price") or 0
    new_city = (ad_data.get("city") or "").lower().strip()
    new_variant = ad_data.get("variant") or ""
    new_color = (ad_data.get("color") or "").lower()
    new_km = ad_data.get("mileage_km") or 0
    new_acc_names = {a["name"] for a in ad_data.get("accessories", [])}
    new_body_words = _extract_significant_words(ad_data.get("body") or "")

    candidates = []

    for row in rows:
        ad = dict(row)
        ad_id = ad["id"]
        score = 0
        reasons = []

        # ── Ville (signal fort — un repost est toujours dans la meme ville) ──
        db_city = (ad.get("city") or "").lower().strip()
        if not (db_city and new_city and db_city == new_city):
            continue  # pas la meme ville = pas un repost, skip
        score += 35
        reasons.append(f"meme ville ({ad.get('city')})")

        # ── Prix ──
        db_price = ad.get("price") or 0
        if new_price and db_price:
            ratio = abs(new_price - db_price) / max(new_price, db_price)
            if ratio <= 0.15:
                score += 20
                delta = int(new_price - db_price)
                if delta < 0:
                    reasons.append(f"prix baisse ({int(db_price)}€ → {int(new_price)}€, {delta}€)")
                elif delta > 0:
                    reasons.append(f"prix hausse ({int(db_price)}€ → {int(new_price)}€, +{delta}€)")
                else:
                    reasons.append(f"meme prix ({int(db_price)}€)")
                if ratio <= 0.05:
                    score += 10
            else:
                continue  # prix trop different = pas un repost

        # ── Description (signal le plus discriminant) ──
        if new_body_words:
            db_body_words = _extract_significant_words(ad.get("body") or "")
            if db_body_words:
                common_words = new_body_words & db_body_words
                union_words = new_body_words | db_body_words
                if union_words:
                    word_jaccard = len(common_words) / len(union_words)
                    if word_jaccard >= 0.3:
                        score += 25
                        reasons.append(f"description similaire ({int(word_jaccard*100)}% mots communs)")
                        if word_jaccard >= 0.5:
                            score += 10

        # ── Accessoires ──
        db_acc_names = acc_by_ad.get(ad_id, set())
        if new_acc_names and db_acc_names:
            common = new_acc_names & db_acc_names
            union = new_acc_names | db_acc_names
            if union:
                jaccard = len(common) / len(union)
                if jaccard >= 0.5:
                    score += 20
                    reasons.append(f"accessoires similaires ({len(common)}/{len(union)})")
                    if jaccard >= 0.75:
                        score += 10

        # ── Kilometrage ──
        db_km = ad.get("mileage_km") or 0
        if new_km and db_km:
            km_diff = abs(new_km - db_km)
            if km_diff <= 1000:
                score += 15
                reasons.append(f"km similaire ({db_km} vs {new_km})")

        # ── Couleur (faible poids) ──
        db_color = (ad.get("color") or "").lower()
        if new_color and db_color and new_color == db_color:
            score += 5
            reasons.append("meme couleur")

        # ── Vendue (indicateur fort de repost) ──
        if ad.get("sold"):
            score += 10
            reasons.append("annonce en base marquee vendue")

        if score >= 80:
            # Calculer le delta prix pour l'affichage
            price_delta = None
            if new_price and db_price:
                price_delta = int(new_price - db_price)

            candidates.append({
                "id": ad_id,
                "url": ad.get("url", ""),
                "subject": ad.get("subject", ""),
                "price": ad.get("price"),
                "city": ad.get("city"),
                "department": ad.get("department"),
                "variant": ad.get("variant"),
                "color": ad.get("color"),
                "sold": bool(ad.get("sold", 0)),
                "mileage_km": ad.get("mileage_km"),
                "score": score,
                "reasons": reasons,
                "price_delta": price_delta,
            })

    # Trier : score desc, puis non-vendue d'abord (repost le plus recent),
    # puis prix le plus proche
    candidates.sort(key=lambda x: (
        -x["score"],
        0 if not x["sold"] else 1,  # non-vendue en premier
        abs(x.get("price_delta") or 999999),  # prix le plus proche
    ))
    return candidates[:3]


@app.post("/api/crawl/extract")
def crawl_extract(req: ExtractRequest):
    """
    Extrait une annonce complete pour le crawl.

    Retourne les donnees extraites + si l'annonce existe deja en base,
    les differences entre la version en base et la version crawlee.
    """
    from .extractor import fetch_ad
    import lbc as lbc_lib

    conn_ov = _get_db()
    overrides = get_accessory_overrides(conn_ov)
    conn_ov.close()

    try:
        client = lbc_lib.Client()
        ad_data = fetch_ad(req.url, client=client, price_overrides=overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur extraction : {e}")

    # Verifier si l'annonce existe deja en base
    conn = _get_db()
    existing_row = conn.execute("SELECT * FROM ads WHERE id = ?", (req.ad_id,)).fetchone()

    existing = None
    diffs = []

    if existing_row:
        existing = dict(existing_row)
        # Charger les accessoires existants
        existing["accessories"] = [
            dict(r) for r in conn.execute(
                "SELECT name, category, source, estimated_new_price, estimated_used_price "
                "FROM ad_accessories WHERE ad_id = ? ORDER BY category, name",
                (req.ad_id,),
            ).fetchall()
        ]

        # Calculer les differences
        compare_fields = [
            ("price", "Prix"),
            ("year", "Annee"),
            ("mileage_km", "Kilometrage"),
            ("variant", "Variante"),
            ("color", "Couleur"),
            ("wheel_type", "Jantes"),
            ("city", "Ville"),
            ("department", "Departement"),
            ("seller_type", "Vendeur"),
            ("estimated_new_price", "Prix neuf ref."),
        ]

        for field, label in compare_fields:
            old_val = existing.get(field)
            new_val = ad_data.get(field)
            if old_val != new_val:
                diffs.append({
                    "field": field,
                    "label": label,
                    "old": old_val,
                    "new": new_val,
                })

        # Comparer les accessoires
        old_acc_names = sorted([a["name"] for a in existing.get("accessories", [])])
        new_acc_names = sorted([a["name"] for a in ad_data.get("accessories", [])])
        if old_acc_names != new_acc_names:
            added = [n for n in new_acc_names if n not in old_acc_names]
            removed = [n for n in old_acc_names if n not in new_acc_names]
            diffs.append({
                "field": "accessories",
                "label": "Accessoires",
                "old": f"{len(old_acc_names)} accessoires",
                "new": f"{len(new_acc_names)} accessoires",
                "added": added,
                "removed": removed,
            })

    # Recherche de doublons potentiels (reposts)
    potential_duplicates = _find_potential_duplicates(conn, ad_data, req.ad_id)

    conn.close()

    return {
        "ad_data": ad_data,
        "exists_in_db": existing is not None,
        "existing": existing,
        "diffs": diffs,
        "potential_duplicates": potential_duplicates,
    }


@app.get("/api/export")
def export_csv():
    """Telecharge le CSV."""
    conn = _get_db()
    ads = get_all_ads(conn)
    conn.close()

    output = io.StringIO()
    fieldnames = [
        "id", "url", "subject", "price", "year", "mileage_km",
        "color", "variant", "wheel_type", "estimated_new_price",
        "city", "department", "seller_type", "nb_accessories",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=";")
    writer.writeheader()

    for ad in ads:
        writer.writerow({
            "id": ad["id"],
            "url": ad["url"],
            "subject": ad["subject"],
            "price": ad["price"],
            "year": ad.get("year"),
            "mileage_km": ad.get("mileage_km"),
            "color": ad.get("color"),
            "variant": ad.get("variant"),
            "wheel_type": ad.get("wheel_type"),
            "estimated_new_price": ad.get("estimated_new_price"),
            "city": ad.get("city"),
            "department": ad.get("department"),
            "seller_type": ad.get("seller_type"),
            "nb_accessories": len(ad.get("accessories", [])),
        })

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export_annonces.csv"},
    )
