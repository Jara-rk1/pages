#!/usr/bin/env python3
"""
PEPI News Dashboard Generator
Fetches Australian policy/government news from RSS feeds and generates
a KPMG-branded static HTML dashboard.
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html import escape, unescape
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SECTORS = {
    "aged_care": {
        "label": "Aged Care",
        "icon": "🏥",
        "colour": "#00338D",
        "queries": [
            "aged care reform Australia",
            "Support at Home aged care",
            "AN-ACC aged care funding",
        ],
    },
    "ndis": {
        "label": "NDIS & Disability",
        "icon": "♿",
        "colour": "#00B8F5",
        "queries": [
            "NDIS reform Australia",
            "NDIS sustainability funding",
            "disability services Australia policy",
        ],
    },
    "health": {
        "label": "Health",
        "icon": "⚕️",
        "colour": "#1E49E2",
        "queries": [
            "Australian health policy",
            "Medicare reform Australia",
            "mental health policy Australia",
        ],
    },
    "child_protection": {
        "label": "Child Protection",
        "icon": "🛡️",
        "colour": "#7213EA",
        "queries": [
            "child protection Australia",
            "out of home care Australia",
            "Queensland child safety inquiry",
        ],
    },
    "education": {
        "label": "Education",
        "icon": "🎓",
        "colour": "#76D2FF",
        "queries": [
            "Australian education policy",
            "universities accord Australia",
            "ECEC childcare policy Australia",
        ],
    },
    "housing": {
        "label": "Housing & Homelessness",
        "icon": "🏠",
        "colour": "#00C0AE",
        "queries": [
            "Australian housing policy",
            "social housing Australia",
            "homelessness policy Australia",
        ],
    },
    "infrastructure": {
        "label": "Infrastructure",
        "icon": "🏗️",
        "colour": "#AB0D82",
        "queries": [
            "Australian infrastructure policy",
            "Infrastructure Australia review",
        ],
    },
    "public_service": {
        "label": "Public Service & Budget",
        "icon": "🏛️",
        "colour": "#B497FF",
        "queries": [
            "Australian public service reform",
            "Australian federal budget",
            "Productivity Commission Australia",
        ],
    },
}

# Max articles per sector
MAX_PER_SECTOR = 8
# Max total articles
MAX_TOTAL = 50

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


# ---------------------------------------------------------------------------
# RSS Fetching
# ---------------------------------------------------------------------------


def fetch_rss(query: str, max_results: int = 10) -> list[dict]:
    """Fetch articles from Google News RSS for a search query."""
    encoded = urllib.request.quote(query)
    url = (
        f"https://news.google.com/rss/search?"
        f"q={encoded}+when:3d&hl=en-AU&gl=AU&ceid=AU:en"
    )

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"  [WARN] Failed to fetch '{query}': {e}", file=sys.stderr)
        return []

    articles = []
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        print(f"  [WARN] Failed to parse RSS for '{query}'", file=sys.stderr)
        return []

    for item in root.iter("item"):
        title_el = item.find("title")
        link_el = item.find("link")
        pub_el = item.find("pubDate")
        desc_el = item.find("description")

        if title_el is None or link_el is None:
            continue

        title = title_el.text or ""
        link = link_el.text or ""
        pub_date = pub_el.text if pub_el is not None else ""
        description = ""
        source = ""

        if desc_el is not None and desc_el.text:
            raw = desc_el.text
            # Google News descriptions contain HTML with source info
            # Extract source from <font> or <a> tags
            src_match = re.search(r"<font[^>]*>([^<]+)</font>", raw)
            if src_match:
                source = unescape(src_match.group(1).strip())
            # Strip HTML tags for clean description
            clean = re.sub(r"<[^>]+>", "", raw).strip()
            if clean:
                description = unescape(clean)

        # Also try to get source from title (Google News format: "Title - Source")
        if not source and " - " in title:
            parts = title.rsplit(" - ", 1)
            if len(parts) == 2:
                source = parts[1].strip()
                title = parts[0].strip()

        # Parse date
        date_iso = ""
        date_display = ""
        if pub_date:
            try:
                from email.utils import parsedate_to_datetime

                dt = parsedate_to_datetime(pub_date)
                date_iso = dt.isoformat()
                date_display = dt.strftime("%d %b %Y, %I:%M %p")
            except Exception:
                date_display = pub_date

        articles.append(
            {
                "title": title,
                "link": link,
                "source": source,
                "description": description[:300],
                "date": date_display,
                "date_iso": date_iso,
            }
        )

        if len(articles) >= max_results:
            break

    return articles


def fetch_all_news() -> dict:
    """Fetch news for all sectors, deduplicate by title."""
    all_news = {}
    seen_titles = set()

    for sector_id, sector in SECTORS.items():
        print(f"Fetching: {sector['label']}...")
        sector_articles = []

        for query in sector["queries"]:
            articles = fetch_rss(query, max_results=5)
            for article in articles:
                # Deduplicate by normalised title
                norm_title = re.sub(r"\s+", " ", article["title"].lower().strip())
                if norm_title not in seen_titles:
                    seen_titles.add(norm_title)
                    sector_articles.append(article)

        # Sort by date (newest first) and cap
        sector_articles.sort(key=lambda a: a.get("date_iso", ""), reverse=True)
        all_news[sector_id] = sector_articles[:MAX_PER_SECTOR]
        print(f"  -> {len(all_news[sector_id])} articles")

    return all_news


# ---------------------------------------------------------------------------
# HTML Generation
# ---------------------------------------------------------------------------

SVG_LOGO_PATH = (
    "m59.4297.0894165v14.8992835l-.1935.157-.1935.157-.1855.1649-.1773.1648"
    "-.1693.1649-.1693.1727-.1613.1727-.1612.1727v-16.2259835h-16.9549v13.5647835"
    "h-1.4028v-13.5647835h-16.9549v13.5883835h-1.4028v-13.5883835h-16.95487"
    "v15.4880835l-4.329426 14.0436h3.805376l1.91075-6.2172h.54823l3.16039 "
    "6.2172h4.59545l-3.0636-6.2172h6.9496l-1.9269 6.2172h4.1521l1.9027-6.2015"
    "h.9191v-.0157h1.306.1049 7.8445l-1.8382 6.2015h4.1924l1.7817-6.2015h1.8866"
    "l.0483 6.2015h3.5152l4.0391-6.2015h2.6444l-1.3705 6.2015h4.1278l1.3464"
    "-6.2015h2.3864l-.0161.3533.0086.3611.0161.3453.0322.3455.0242.1648.0241"
    ".1649.0322.1648.0323.1649.0402.1648.0403.157.0484.157.0483.157.0565.157"
    ".0565.1492.0644.1491.0646.1413.0726.1492.0725.1413.0807.1334.0807.1413"
    ".0887.1335.0967.1256.0968.1334.1048.1178.1048.1256.1048.1177.1209.1178"
    ".121.1099.1531.1256.1532.1256.1613.1177.1693.1099.1693.1099.1693.1021"
    ".1774.0863.1854.0942.1774.0785.1854.0784.1854.0707.1935.0707.1935.0628"
    ".1935.055.1935.0549.1935.0471.387.0863.395.0629.387.0549.387.0471.3789"
    ".0314.3709.0157.3628.0158h.3466l.4677-.0075.4676-.0074.4756-.0236.4757"
    "-.0236.4757-.0392.4757-.0393.4756-.0471.4757-.055.4837-.0628.4838-.0707"
    ".4837-.0785.4837-.0785.4838-.0863.4837-.0942.4837-.0942.4918-.1099 "
    "1.4351-5.6284h4.7084v-23.3145573h-16.9549z"
    "m-53.50905 22.7335835.02417-.0863.05649.0863z"
    "m14.77005-8.3524-.2419.7929-2.2574 7.3005-.0887.259h-7.4173l-.5724-1.1932"
    " 7.9897-7.952h-5.1357l-6.2482 6.5547 2.02361-6.5547h-3.78924v-12.999627"
    "h15.73743v13.792427z"
    "m4.3777 6.1701-.1209.0075-.1129.0074-.1209.0075h-.129-.1693-.1451"
    "l-.1371.0074h-.129l-1.0077-.0074.4676-1.6799.2176-.8321.5322-1.9547"
    "h.1693.1773l.1693-.0074h.1613.782l.4757.0074.4353.0158.1935.0074.1855"
    ".0157.1773.0236.1613.0236.1451.0235.1371.0393.129.0393.1128.0471.0968"
    ".0471.0887.0629.0806.0628.0645.0785.0403.0629.0322.0628.0322.0707.0242"
    ".0785.0161.0863.0085.0863v.0942.102l-.0085.1099-.0076.1099-.0242.1256"
    "-.0241.1256-.0726.2669-.0887.2983-.0887.2512-.0968.2434-.1048.2276-.1129"
    ".212-.0565.0942-.0564.0942-.0646.0942-.0726.0863-.0726.0863-.0726.0785"
    "-.0806.0785-.0807.0706-.0887.0629-.0887.0707-.0967.0549-.1049.0628-.1048"
    ".055-.1128.0471-.1129.0471-.1209.0393-.129.0471-.1371.0314-.1451.0314"
    "-.1451.0313-.1613.0236-.1612.0236-.1693.0157-.1774.0157z"
    "m11.4645 2.1823 1.6528-5.7305.0645 5.7305h-1.7172z"
    "m2.5155-9.1688h-3.9344l-2.7089 9.1688h-4.1763l.1935-.0784.1935-.0785"
    ".1855-.0785.1854-.0863.1774-.0864.1693-.102.1693-.0942.1612-.1021.1613"
    "-.1099.1531-.1099.1452-.1098.1451-.1257.137-.1177.129-.1335.129-.1256"
    ".121-.1413.1209-.1334.1129-.1492.1048-.1413.1048-.157.0967-.157.0887"
    "-.1569.0888-.1649.0806-.1727.0807-.1727.0726-.1727.0644-.1806.0645-.1884"
    ".0484-.1884.0565-.1884.0402-.2041.0403-.1962.0565-.314.0483-.2983.0323"
    "-.2826.0241-.2669.0086-.2669-.0086-.2434-.0075-.2433-.0323-.2277-.0322"
    "-.2119-.0565-.212-.0565-.1962-.0806-.1884-.0887-.1806-.0968-.1805-.1128"
    "-.1649-.129-.157-.1049-.1099-.1048-.1099-.1128-.0942-.121-.0863-.129"
    "-.0863-.129-.0785-.137-.0706-.1371-.0629-.1451-.0628-.1451-.0471-.1532"
    "-.0472-.1532-.0471-.1612-.0393-.1613-.0313-.1612-.0314-.1693-.0236-.3467"
    "-.0471-.3467-.0235-.3547-.0236-.3628-.0074h-.7256-.7175-.2258-.4031-.4999"
    "-.5563-.5401-.4596-.3225-.1209v-12.976108h15.7375v12.976108z"
    "m9.5617 9.1688h-2.3622l3.5796-5.495z"
    "m8.7959-8.9097-.0085 3.1792-.2015.2748-.1855.2826-.1854.2826-.1693.2826"
    "-.1613.2826-.1612.2904-.1371.2826-.137.2826-.129.2748-.1129.2826-.1129"
    ".2747-.0967.2669-.0887.2669-.0807.2591-.0726.2512-.0645.2512-.0403.1648"
    "-.0403.1727-.0402.1649-.0323.1727-.0322.1648-.0242.1649-.0241.1648-.0161"
    ".1727h-2.3139l1.9753-9.1452-6.6594-.0075-5.958 9.1531h-.4354v-22.144827"
    "h15.7455v13.235127z"
    "m9.0781 12.6542-.3305.0549-.3387.0471-.3386.0471-.3305.0393-.3306.0314"
    "-.3305.0236-.3225.0157h-.3225-.2096l-.2096-.0074-.2016-.0158-.2015-.0235"
    "-.1935-.0314-.1855-.0314-.1854-.0393-.1774-.0471-.1693-.0549-.1693-.055"
    "-.1612-.0706-.1532-.0707-.1532-.0863-.1451-.0863-.1371-.0942-.129-.0942"
    "-.129-.1099-.1128-.1178-.1129-.1177-.1048-.1335-.0968-.1334-.0887-.1492"
    "-.0806-.1491-.0807-.157-.0645-.1649-.0565-.1805-.0483-.1806-.0484-.1884"
    "-.0322-.1962-.0242-.2041-.0161-.212-.0085-.2198h7.3366l-.8062 3.1636z"
    "m9.3038-3.7445h-3.9666l.653-2.5591h-7.9493l-.6531 2.5591h-3.8456v-.5259"
    "l.0483-.2198.0403-.2198.0483-.2355.0483-.2355.0726-.2591.0726-.259.0807"
    "-.2591.0887-.2512.0967-.2512.1049-.2512.1128-.2433.1129-.2434.129-.2433"
    ".129-.2277.1371-.2355.1531-.2198.1532-.2198.1532-.2119.1693-.2041.1774"
    "-.1963.1854-.1884.1854-.1727.2016-.1727.2015-.1648.2097-.1492.2257-.1413"
    ".2258-.1256.2338-.1177.2418-.1099.2499-.0942.258-.0785.2661-.0629.2741"
    "-.0549.2822-.0393.2902-.0235.2983-.0075.2338.0075.2338.0157.2338.0314"
    ".2258.0471.1129.0314.1048.0313.1048.0314.0967.0471.0968.0393.0967.055"
    ".0887.0549.0887.0549.0807.0707.0806.0707.0726.0706.0726.0863.0646.0785"
    ".0565.0942.0483.1021.0483.102.0403.1099.0322.1178.0242.1177.0242.1335"
    ".0085.1334v.1413.1492l-.0161.157h4.7406l.0726-.3219.0645-.3689.0322"
    "-.1963.0162-.2119.0161-.212v-.2198l-.0076-.2276-.0242-.2355-.0241-.1099"
    "-.0162-.1178-.0322-.1177-.0322-.1178-.0403-.1256-.0403-.1177-.0483-.1178"
    "-.0565-.1177-.0565-.1178-.0726-.1177-.0726-.1178-.0806-.1177-.0968-.1256"
    "-.1048-.1178-.1048-.1177-.1129-.1099-.1209-.1099-.129-.1021-.129-.0942"
    "-.137-.0942-.1452-.0942-.1451-.0785-.1532-.0784-.1612-.0785-.1612-.0707"
    "-.1694-.0707-.1773-.0628-.1774-.0629-.1774-.0549-.1935-.0471-.1854-.0471"
    "-.2015-.0471-.2016-.0393-.2016-.0393-.2096-.0314-.2177-.0236-.4434-.0471"
    "-.4515-.0393-.4756-.0157-.4838-.0074-.3628.0074-.3789.0075-.395.0235"
    "-.4112.0314-.4273.0471-.4354.0549-.4434.0707-.4515.0942-.2257.0471-.2338"
    ".0549-.2258.0629-.2338.0628-.2338.0707-.2338.0785-.2257.0785-.2338.0863"
    "-.2338.0942-.2338.102-.2258.1021-.2338.1099-.2257.1177-.2258.1256-.2257"
    ".1256-.2258.1413v-13.894463h15.7617v22.144863z"
)


def generate_html(news_data: dict, output_path: str) -> None:
    """Generate the KPMG-branded news dashboard HTML."""
    now = datetime.now(timezone.utc)
    updated_str = now.strftime("%d %B %Y at %H:%M UTC")
    today_str = now.strftime("%A, %d %B %Y")

    total_articles = sum(len(v) for v in news_data.values())

    # Build sector filter buttons
    filter_buttons = []
    for sid, sec in SECTORS.items():
        count = len(news_data.get(sid, []))
        filter_buttons.append(
            f'<button class="filter-btn" data-sector="{sid}" '
            f'style="--sector-colour: {sec["colour"]}">'
            f'{sec["icon"]} {sec["label"]} <span class="count">{count}</span></button>'
        )

    # Build news cards
    cards_html = []
    for sid, sec in SECTORS.items():
        articles = news_data.get(sid, [])
        for article in articles:
            title_safe = escape(article["title"])
            desc_safe = escape(article["description"])
            source_safe = escape(article["source"])
            link_safe = escape(article["link"])
            date_safe = escape(article["date"])

            cards_html.append(f"""
        <article class="news-card" data-sector="{sid}">
            <div class="card-accent" style="background: {sec['colour']}"></div>
            <div class="card-body">
                <div class="card-meta">
                    <span class="sector-badge" style="background: {sec['colour']}15; color: {sec['colour']}">{sec['icon']} {sec['label']}</span>
                    <span class="card-date">{date_safe}</span>
                </div>
                <h3 class="card-title"><a href="{link_safe}" target="_blank" rel="noopener">{title_safe}</a></h3>
                <p class="card-desc">{desc_safe}</p>
                <div class="card-source">{source_safe}</div>
            </div>
        </article>""")

    # Build sector summary stats
    sector_stats = []
    for sid, sec in SECTORS.items():
        count = len(news_data.get(sid, []))
        sector_stats.append(f"""
            <div class="stat-card">
                <div class="stat-icon" style="background: {sec['colour']}15; color: {sec['colour']}">{sec['icon']}</div>
                <div class="stat-value">{count}</div>
                <div class="stat-label">{sec['label']}</div>
            </div>""")

    html = f"""<!DOCTYPE html>
<html lang="en-AU">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PEPI Daily News Dashboard | KPMG</title>
    <meta name="description" content="Daily news monitoring for Policy, Economics, and Public Impact sectors across Australia">
    <style>
        *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

        :root {{
            --kpmg-blue: #00338D;
            --pacific-blue: #00B8F5;
            --cobalt-blue: #1E49E2;
            --dark-blue: #0C233C;
            --light-blue: #ACEAFF;
            --purple: #7213EA;
            --teal: #00C0AE;
            --text-dark: #333333;
            --text-mid: #666666;
            --grey-border: #E5E5E5;
            --grey-bg: #F7F8FA;
            --white: #FFFFFF;
        }}

        body {{
            font-family: Arial, Helvetica, sans-serif;
            color: var(--text-dark);
            background: var(--grey-bg);
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
        }}

        /* Header */
        .header {{
            background: var(--dark-blue);
            padding: 20px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }}
        .header-left {{
            display: flex;
            align-items: center;
            gap: 20px;
        }}
        .header-logo svg {{ height: 30px; width: auto; }}
        .header-divider {{
            width: 1px;
            height: 28px;
            background: rgba(255,255,255,0.25);
        }}
        .header-title {{
            color: var(--white);
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 0.02em;
        }}
        .header-subtitle {{
            color: rgba(255,255,255,0.6);
            font-size: 12px;
        }}
        .header-right {{
            display: flex;
            align-items: center;
            gap: 16px;
        }}
        .header-updated {{
            color: rgba(255,255,255,0.5);
            font-size: 11px;
        }}
        .live-dot {{
            width: 8px;
            height: 8px;
            background: var(--teal);
            border-radius: 50%;
            animation: pulse 2s ease-in-out infinite;
        }}
        @keyframes pulse {{
            0%, 100% {{ opacity: 1; }}
            50% {{ opacity: 0.4; }}
        }}

        /* Main container */
        .container {{
            max-width: 1280px;
            margin: 0 auto;
            padding: 24px 32px;
        }}

        /* Summary bar */
        .summary-bar {{
            display: flex;
            gap: 12px;
            margin-bottom: 24px;
            overflow-x: auto;
            padding-bottom: 4px;
        }}
        .stat-card {{
            background: var(--white);
            border-radius: 4px;
            padding: 16px 20px;
            min-width: 140px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
        }}
        .stat-icon {{
            width: 36px;
            height: 36px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        }}
        .stat-value {{
            font-size: 22px;
            font-weight: 700;
            color: var(--kpmg-blue);
        }}
        .stat-label {{
            font-size: 11px;
            color: var(--text-mid);
            white-space: nowrap;
        }}

        /* Search and filters */
        .controls {{
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 24px;
            align-items: center;
        }}
        .search-box {{
            flex: 1;
            min-width: 240px;
            position: relative;
        }}
        .search-box input {{
            width: 100%;
            padding: 10px 16px 10px 40px;
            border: 1px solid var(--grey-border);
            border-radius: 4px;
            font-size: 14px;
            font-family: Arial, Helvetica, sans-serif;
            background: var(--white);
            transition: border-color 0.2s;
        }}
        .search-box input:focus {{
            outline: none;
            border-color: var(--pacific-blue);
        }}
        .search-box::before {{
            content: "\\1F50D";
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 14px;
            opacity: 0.4;
        }}
        .filter-row {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }}
        .filter-btn {{
            padding: 6px 14px;
            border: 1px solid var(--grey-border);
            border-radius: 4px;
            background: var(--white);
            font-size: 12px;
            font-family: Arial, Helvetica, sans-serif;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--text-dark);
        }}
        .filter-btn:hover {{
            border-color: var(--sector-colour, var(--pacific-blue));
        }}
        .filter-btn.active {{
            background: var(--sector-colour, var(--kpmg-blue));
            color: var(--white);
            border-color: var(--sector-colour, var(--kpmg-blue));
        }}
        .filter-btn .count {{
            font-size: 10px;
            background: rgba(0,0,0,0.08);
            padding: 1px 6px;
            border-radius: 10px;
        }}
        .filter-btn.active .count {{
            background: rgba(255,255,255,0.25);
        }}

        /* News grid */
        .news-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
            gap: 16px;
        }}
        .news-card {{
            background: var(--white);
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            overflow: hidden;
            display: flex;
            transition: opacity 0.2s;
        }}
        .news-card.hidden {{
            display: none;
        }}
        .card-accent {{
            width: 4px;
            flex-shrink: 0;
        }}
        .card-body {{
            padding: 16px 20px;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }}
        .card-meta {{
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .sector-badge {{
            font-size: 11px;
            font-weight: 600;
            padding: 2px 10px;
            border-radius: 12px;
            white-space: nowrap;
        }}
        .card-date {{
            font-size: 11px;
            color: var(--text-mid);
        }}
        .card-title {{
            font-size: 15px;
            font-weight: 700;
            line-height: 1.35;
        }}
        .card-title a {{
            color: var(--text-dark);
            text-decoration: none;
        }}
        .card-title a:hover {{
            color: var(--kpmg-blue);
        }}
        .card-desc {{
            font-size: 13px;
            color: var(--text-mid);
            line-height: 1.5;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }}
        .card-source {{
            font-size: 11px;
            color: var(--text-mid);
            font-style: italic;
            margin-top: auto;
        }}

        /* Empty state */
        .empty-state {{
            text-align: center;
            padding: 60px 20px;
            color: var(--text-mid);
            display: none;
        }}
        .empty-state.visible {{
            display: block;
        }}
        .empty-state-icon {{
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.3;
        }}

        /* Footer */
        .footer {{
            text-align: center;
            padding: 32px;
            color: var(--text-mid);
            font-size: 11px;
            border-top: 1px solid var(--grey-border);
            margin-top: 40px;
        }}
        .footer-classification {{
            font-weight: 700;
            color: var(--kpmg-blue);
            margin-bottom: 4px;
        }}

        /* Responsive */
        @media (max-width: 768px) {{
            .header {{ padding: 16px; flex-wrap: wrap; gap: 12px; }}
            .container {{ padding: 16px; }}
            .summary-bar {{ gap: 8px; }}
            .stat-card {{ min-width: 120px; padding: 12px 14px; }}
            .news-grid {{ grid-template-columns: 1fr; }}
            .filter-btn {{ font-size: 11px; padding: 5px 10px; }}
        }}

        /* Print */
        @media print {{
            .header {{ position: static; }}
            .controls {{ display: none; }}
            .news-card {{ break-inside: avoid; box-shadow: none; border: 1px solid var(--grey-border); }}
        }}

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {{
            .live-dot {{ animation: none; }}
        }}
    </style>
</head>
<body>
    <header class="header" role="banner">
        <div class="header-left">
            <div class="header-logo">
                <svg fill="none" height="30" viewBox="0 0 77 30" width="77" xmlns="http://www.w3.org/2000/svg" aria-label="KPMG logo">
                    <path fill="#FFFFFF" d="{SVG_LOGO_PATH}"/>
                </svg>
            </div>
            <div class="header-divider"></div>
            <div>
                <div class="header-title">PEPI Daily News Monitor</div>
                <div class="header-subtitle">{today_str}</div>
            </div>
        </div>
        <div class="header-right">
            <div class="live-dot" title="Auto-updated daily"></div>
            <div class="header-updated">Updated {updated_str}</div>
        </div>
    </header>

    <main class="container" role="main">
        <div class="summary-bar" aria-label="Article counts by sector">
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(0,51,141,0.12); color: var(--kpmg-blue)">📰</div>
                <div>
                    <div class="stat-value">{total_articles}</div>
                    <div class="stat-label">Total Articles</div>
                </div>
            </div>
            {''.join(sector_stats)}
        </div>

        <div class="controls">
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="Search articles..." aria-label="Search articles">
            </div>
            <div class="filter-row">
                <button class="filter-btn active" data-sector="all" style="--sector-colour: var(--kpmg-blue)">All</button>
                {''.join(filter_buttons)}
            </div>
        </div>

        <div class="news-grid" id="newsGrid">
            {''.join(cards_html)}
        </div>

        <div class="empty-state" id="emptyState">
            <div class="empty-state-icon">📭</div>
            <p>No articles match your search.</p>
        </div>
    </main>

    <footer class="footer" role="contentinfo">
        <div class="footer-classification">INTERNAL USE ONLY</div>
        <p>PEPI News Dashboard &mdash; auto-generated {updated_str}</p>
        <p>Sources: Google News RSS (Australian edition). Articles are aggregated for internal awareness only.</p>
        <p>&copy; {now.year} KPMG, an Australian partnership. All rights reserved.</p>
    </footer>

    <script>
        // Filter and search logic
        const cards = document.querySelectorAll('.news-card');
        const filterBtns = document.querySelectorAll('.filter-btn');
        const searchInput = document.getElementById('searchInput');
        const emptyState = document.getElementById('emptyState');
        let activeSector = 'all';

        function applyFilters() {{
            const query = searchInput.value.toLowerCase().trim();
            let visible = 0;
            cards.forEach(card => {{
                const sector = card.dataset.sector;
                const text = card.textContent.toLowerCase();
                const matchSector = activeSector === 'all' || sector === activeSector;
                const matchSearch = !query || text.includes(query);
                const show = matchSector && matchSearch;
                card.classList.toggle('hidden', !show);
                if (show) visible++;
            }});
            emptyState.classList.toggle('visible', visible === 0);
        }}

        filterBtns.forEach(btn => {{
            btn.addEventListener('click', () => {{
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeSector = btn.dataset.sector;
                applyFilters();
            }});
        }});

        searchInput.addEventListener('input', applyFilters);
    </script>
</body>
</html>"""

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"\nDashboard written to {output_path}")
    print(f"Total articles: {total_articles}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    output = os.environ.get(
        "OUTPUT_PATH",
        str(Path(__file__).resolve().parent.parent / "docs" / "news-dashboard" / "index.html"),
    )

    print("=" * 60)
    print("PEPI Daily News Dashboard Generator")
    print(f"Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    news = fetch_all_news()
    generate_html(news, output)

    # Also write a JSON snapshot for potential downstream use
    json_path = str(Path(output).parent / "news_data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(
            {"updated": datetime.now(timezone.utc).isoformat(), "sectors": news},
            f,
            indent=2,
            ensure_ascii=False,
        )
    print(f"JSON data written to {json_path}")


if __name__ == "__main__":
    main()
