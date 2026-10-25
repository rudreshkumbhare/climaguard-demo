"""
plan.py — Action plan generation (§5.5, §6 POST /plan).

build_plan(simulation, mode, zone_id) → dict

Deterministic path:
  Authority — top-6 ranked actions by priority = population × vulnerability × (2 if CUT_OFF else 1).
              Action text built from rule templates in SPEC §5.5.
  Citizen   — fact sheet for the chosen zone (nearest hospital, shelter, closed roads).

LLM path (optional):
  If GEMINI_API_KEY is set (loaded from backend/.env via python-dotenv), the deterministic
  facts are sent to Gemini (model: GEMINI_MODEL constant) with the strict system instruction
  from SPEC §5.5. Timeout: 8 seconds. Output is validated:
    • non-empty
    • ≤ 220 words
    • every hospital/shelter name in the output must appear in the facts
      (case-insensitive, punctuation-stripped)
  On any failure the exact reason is logged (missing key, HTTP status, wrong model,
  timeout, or which validation rule failed). Falls back to Python template silently.
  The response always includes source: "llm" | "template".

No HTTP calls other than Gemini.  No hardcoded data.
"""
from __future__ import annotations

import logging
import os
import re
import unicodedata
from pathlib import Path

# ── Load .env from backend/ relative to this file, regardless of CWD ─────────
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(dotenv_path=_env_path, override=False)
except ImportError:
    pass  # python-dotenv not installed; env vars must be set externally

logger = logging.getLogger(__name__)

# ── LLM constants ─────────────────────────────────────────────────────────────

GEMINI_MODEL = "gemini-2.5-flash"          # model name — change here if needed
_GEMINI_TIMEOUT = 8.0                       # seconds
_MAX_WORDS = 220                            # raised from 180 to allow fuller output

_SYSTEM_INSTRUCTION = (
    "Use only the facts provided. Do not invent roads, places, numbers or shelters. "
    "If a fact is missing say 'not available'."
)

# How many authority actions to include (top N by priority score)
_MAX_ACTIONS = 6


# ── Text helpers ──────────────────────────────────────────────────────────────

def _word_count(text: str) -> int:
    return len(text.split())


def _normalise(s: str) -> str:
    """Lowercase, strip punctuation and extra whitespace for fuzzy name matching."""
    s = s.lower()
    s = unicodedata.normalize("NFKD", s)
    s = re.sub(r"[^\w\s]", " ", s)   # replace punctuation with space
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _zone_by_id(zones: list[dict], zone_id: str) -> dict | None:
    for z in zones:
        if z["id"] == zone_id:
            return z
    return None


# ── Deterministic authority plan ──────────────────────────────────────────────

def _build_authority_facts(
    simulation: dict,
    facilities: dict,
    zones: list[dict],
) -> dict:
    """
    Build the structured facts dict for the authority plan.

    Actions are capped at _MAX_ACTIONS (top 6 by priority score).

    Returns:
        {
          "actions": [AuthorityAction dicts],  # ≤ _MAX_ACTIONS, re-ranked 1..N
          "summary_template": str,
          "hospital_statuses": {h_id: status},
          "zone_statuses": {z_id: status},
          "names": {id: name},
          "isolated_hospitals": [name, ...],
          "operational_hospitals": [name, ...],
        }
    """
    cascade = simulation.get("cascade", {})
    hospitals_status: dict[str, str] = {
        h["id"]: h["status"] for h in cascade.get("hospitals", [])
    }
    zone_cascade: dict[str, dict] = {
        z["id"]: z for z in cascade.get("zones", [])
    }

    # Build id→name lookup for all facilities
    all_facilities = (
        facilities.get("hospitals", [])
        + facilities.get("shelters", [])
        + facilities.get("fire_stations", [])
    )
    names: dict[str, str] = {f["id"]: f["name"] for f in all_facilities}
    zone_names: dict[str, str] = {z["id"]: z["name"] for z in zones}

    operational_hospitals = [
        h for h in facilities.get("hospitals", [])
        if hospitals_status.get(h["id"]) == "OPERATIONAL"
    ]
    isolated_hospitals = [
        h for h in facilities.get("hospitals", [])
        if hospitals_status.get(h["id"]) == "ISOLATED"
    ]

    # ── Priority score per zone → sorted descending ───────────────────────────
    scored_zones: list[tuple[float, dict, dict, str]] = []
    for zone in zones:
        zid = zone["id"]
        zc = zone_cascade.get(zid, {})
        status = zc.get("status", "OK")
        multiplier = 2 if status == "CUT_OFF" else 1
        score = zone.get("population", 0) * zone.get("vulnerability", 0) * multiplier
        scored_zones.append((score, zone, zc, status))
    scored_zones.sort(key=lambda x: x[0], reverse=True)

    # ── Build action list (rules from §5.5) ───────────────────────────────────
    # We collect all candidate actions from priority-sorted zones, then cap at
    # _MAX_ACTIONS before returning so the LLM prompt stays concise.
    raw_actions: list[dict] = []
    rank = 1

    for score, zone, zc, status in scored_zones:
        zid   = zone["id"]
        zname = zone_names.get(zid, zid)
        pop   = zone.get("population", 0)
        vuln  = zone.get("vulnerability", 0)

        if status == "CUT_OFF":
            shelter_id   = zc.get("nearest_shelter_id")
            shelter_name = (
                names.get(shelter_id, "nearest available shelter")
                if shelter_id else "nearest available shelter"
            )
            raw_actions.append({
                "rank": rank,
                "action": "Evacuate zone and open emergency shelter",
                "target": zname,
                "reason": f"Zone cut off from all hospitals; {pop:,} residents at risk",
                "est_people": pop,
            })
            rank += 1
            raw_actions.append({
                "rank": rank,
                "action": "Open shelter",
                "target": shelter_name,
                "reason": f"Serve evacuees from {zname} (vulnerability {vuln:.2f})",
                "est_people": pop,
            })
            rank += 1

        elif status == "REROUTED":
            nearest_h_id   = zc.get("nearest_hospital_id")
            nearest_h_name = (
                names.get(nearest_h_id, "nearest operational hospital")
                if nearest_h_id else "nearest operational hospital"
            )
            extra_km = zc.get("extra_km", 0) or 0
            raw_actions.append({
                "rank": rank,
                "action": "Pre-position ambulance at nearest operational hospital",
                "target": nearest_h_name,
                "reason": (
                    f"Route from {zname} extended by {extra_km:.1f} km; "
                    f"{pop:,} residents affected"
                ),
                "est_people": pop,
            })
            rank += 1

        else:  # OK — include high-vulnerability, high-population zones
            if vuln >= 0.7 and pop >= 100_000:
                raw_actions.append({
                    "rank": rank,
                    "action": "Close and signpost closed roads",
                    "target": zname,
                    "reason": (
                        f"High vulnerability area ({vuln:.2f}); "
                        f"{pop:,} residents; roads may close soon"
                    ),
                    "est_people": pop,
                })
                rank += 1

    # Isolated hospital actions (append after zone actions)
    for iso_h in isolated_hospitals:
        if operational_hospitals:
            op_h = operational_hospitals[0]
            raw_actions.append({
                "rank": rank,
                "action": "Pre-position ambulance at nearest operational hospital",
                "target": op_h["name"],
                "reason": f"{iso_h['name']} is isolated — redirect emergency capacity",
                "est_people": 0,
            })
            rank += 1
            raw_actions.append({
                "rank": rank,
                "action": "Protect isolated hospital",
                "target": iso_h["name"],
                "reason": "Hospital isolated; protect staff and remaining patients",
                "est_people": 0,
            })
            rank += 1

    # ── Deduplicate (preserve insertion order) ────────────────────────────────
    seen: set[str] = set()
    unique_actions: list[dict] = []
    for a in raw_actions:
        key = f"{a['action']}|{a['target']}"
        if key not in seen:
            seen.add(key)
            unique_actions.append(a)

    # ── Cap at _MAX_ACTIONS and re-rank 1…N ───────────────────────────────────
    capped = unique_actions[:_MAX_ACTIONS]
    for i, a in enumerate(capped, start=1):
        a["rank"] = i

    # ── Template summary ──────────────────────────────────────────────────────
    n_isolated = sum(1 for s in hospitals_status.values() if s == "ISOLATED")
    n_cut_off  = cascade.get("metrics", {}).get("zones_cut_off", 0)
    level      = simulation.get("risk", {}).get("level", "Unknown")
    template_summary = (
        f"Compound threat level: {level}. "
        f"{n_isolated} hospital(s) isolated. "
        f"{n_cut_off} zone(s) cut off. "
        f"Top {len(capped)} authority actions: "
        + "; ".join(f"{a['action']} → {a['target']}" for a in capped)
        + ". Pre-position ambulances at operational hospitals and open emergency shelters."
    )

    return {
        "actions": capped,
        "summary_template": template_summary,
        "hospital_statuses": hospitals_status,
        "zone_statuses": {
            z["id"]: zone_cascade.get(z["id"], {}).get("status", "OK")
            for z in zones
        },
        "names": names,
        "zone_names": zone_names,
        "isolated_hospitals": [h["name"] for h in isolated_hospitals],
        "operational_hospitals": [h["name"] for h in operational_hospitals],
    }


# ── Deterministic citizen facts ───────────────────────────────────────────────

def _build_citizen_facts(
    simulation: dict,
    zone_id: str,
    facilities: dict,
    zones: list[dict],
) -> dict:
    """
    Build fact dict for a citizen message about a specific zone.
    """
    cascade = simulation.get("cascade", {})
    risk    = simulation.get("risk", {})
    flood   = simulation.get("flood", {})

    names: dict[str, str] = {
        f["id"]: f["name"]
        for f in facilities.get("hospitals", []) + facilities.get("shelters", [])
    }

    zone_cascade = {z["id"]: z for z in cascade.get("zones", [])}
    zc = zone_cascade.get(zone_id, {})

    zone      = _zone_by_id(zones, zone_id)
    zone_name = zone["name"] if zone else zone_id
    status    = zc.get("status", "OK")

    nearest_h_id   = zc.get("nearest_hospital_id")
    nearest_h_name = names.get(nearest_h_id) if nearest_h_id else None

    nearest_s_id   = zc.get("nearest_shelter_id")
    nearest_s_name = names.get(nearest_s_id) if nearest_s_id else None

    roads_closed_pct = flood.get("roads_closed_pct", 0)
    closed_roads = (
        [f"~{roads_closed_pct:.0f}% of local roads closed due to flooding"]
        if roads_closed_pct > 0 else []
    )

    extra_km = zc.get("extra_km")
    level    = risk.get("level", "Unknown")

    # Template citizen message
    if status == "CUT_OFF":
        msg = (
            f"⚠️  {zone_name}: EVACUATION REQUIRED. "
            f"Threat level: {level}. "
            "All roads to hospitals are currently cut off. "
        )
        msg += (
            f"Go to nearest shelter: {nearest_s_name}. "
            if nearest_s_name else "Shelter information: not available. "
        )
        if closed_roads:
            msg += closed_roads[0] + ". "
        msg += "Follow official evacuation guidance."

    elif status == "REROUTED":
        h_str  = nearest_h_name or "not available"
        km_str = f"+{extra_km:.1f} km longer than usual" if extra_km else "longer than usual"
        msg = (
            f"⚡ {zone_name}: REROUTING IN EFFECT. "
            f"Threat level: {level}. "
            f"Your nearest accessible hospital is {h_str} (route is {km_str}). "
        )
        if nearest_s_name:
            msg += f"Nearest shelter: {nearest_s_name}. "
        if closed_roads:
            msg += closed_roads[0] + ". "
        msg += "Avoid flooded roads. Follow authority instructions."

    else:
        h_str = nearest_h_name or "not available"
        msg = (
            f"✅ {zone_name}: CONDITIONS NORMAL. "
            f"Threat level: {level}. "
            f"Your nearest hospital is {h_str}. "
        )
        if nearest_s_name:
            msg += f"Nearest shelter: {nearest_s_name}. "
        msg += "Stay alert and monitor official updates."

    return {
        "zone_name": zone_name,
        "risk_level": level,
        "status": status,
        "nearest_hospital": nearest_h_name,
        "nearest_shelter": nearest_s_name,
        "closed_roads": closed_roads,
        "extra_km": extra_km,
        "template_message": msg,
    }


# ── Gemini rewrite ────────────────────────────────────────────────────────────

def _gemini_rewrite(facts_text: str, mode: str, api_key: str) -> str | None:
    """
    Call Gemini to rewrite the facts into a polished message.

    Returns the rewritten text on success, or None on any failure.
    Every failure path logs the specific reason (without exposing the key).
    """
    try:
        import google.genai as genai
        from google.genai import types as genai_types
    except ImportError:
        logger.warning("LLM fallback reason: google-genai package not installed.")
        return None

    if mode == "authority":
        user_prompt = (
            "You are writing a concise emergency briefing for disaster management authorities. "
            f"Rewrite the following facts as a clear, numbered action plan in under {_MAX_WORDS} words. "
            "Do not add any new information.\n\nFacts:\n" + facts_text
        )
    else:
        user_prompt = (
            "You are writing a plain-language safety message for citizens. "
            f"Rewrite the following facts as a clear, friendly safety message in under {_MAX_WORDS} words. "
            "Do not add any new information.\n\nFacts:\n" + facts_text
        )

    try:
        # timeout is in milliseconds and belongs on the Client, not GenerateContentConfig
        client = genai.Client(
            api_key=api_key,
            http_options=genai_types.HttpOptions(timeout=int(_GEMINI_TIMEOUT * 1000)),
        )
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=user_prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=_SYSTEM_INSTRUCTION,
                max_output_tokens=600,
                temperature=0.2,
            ),
        )
    except Exception as exc:
        exc_str = str(exc)
        # Classify the error without leaking the key
        if "timeout" in exc_str.lower() or "timed out" in exc_str.lower():
            logger.warning(
                "LLM fallback reason: Gemini request timed out after %.0fs.", _GEMINI_TIMEOUT
            )
        elif "404" in exc_str or "not found" in exc_str.lower():
            logger.warning(
                "LLM fallback reason: model '%s' not found (HTTP 404). "
                "Check GEMINI_MODEL constant.", GEMINI_MODEL
            )
        elif "403" in exc_str or "permission" in exc_str.lower():
            logger.warning(
                "LLM fallback reason: permission denied (HTTP 403). "
                "Check that GEMINI_API_KEY is valid and has access to '%s'.", GEMINI_MODEL
            )
        elif "401" in exc_str or "api_key" in exc_str.lower() or "invalid" in exc_str.lower():
            logger.warning(
                "LLM fallback reason: authentication failed (HTTP 401). "
                "GEMINI_API_KEY may be invalid or expired."
            )
        elif "429" in exc_str or "quota" in exc_str.lower() or "rate" in exc_str.lower():
            logger.warning(
                "LLM fallback reason: rate-limited or quota exceeded (HTTP 429)."
            )
        else:
            # Log full exc string but scrub anything that looks like a key
            safe = re.sub(r"[A-Za-z0-9_\-]{30,}", "<REDACTED>", exc_str)
            logger.warning("LLM fallback reason: Gemini call failed — %s", safe)
        return None

    # ── Parse response ────────────────────────────────────────────────────────
    try:
        text = response.text
    except Exception as exc:
        # response.text raises if content was blocked or empty
        finish = getattr(response, "candidates", [{}])
        finish_reason = (
            finish[0].finish_reason if finish else "unknown"
        ) if finish else "unknown"
        logger.warning(
            "LLM fallback reason: response.text raised — finish_reason=%s, exc=%s",
            finish_reason, exc,
        )
        return None

    if not text or not text.strip():
        logger.warning("LLM fallback reason: Gemini returned an empty response.")
        return None

    return text.strip()


# ── LLM output validation ─────────────────────────────────────────────────────

def _validate_llm_output(text: str, facts: dict) -> bool:
    """
    Validate LLM output. Returns True if valid; logs the specific rule that fails.

    Rules:
      1. Non-empty (checked before calling this)
      2. ≤ _MAX_WORDS words
      3. Every hospital/shelter proper-noun sequence in the output must match
         (case-insensitive, punctuation-stripped) at least one name in the facts.
    """
    wc = _word_count(text)
    if wc > _MAX_WORDS:
        logger.warning(
            "LLM fallback reason: output too long (%d words; limit %d).", wc, _MAX_WORDS
        )
        return False

    # Collect known names from facts (normalised for comparison)
    fact_names_norm: list[str] = []
    for key in ("nearest_hospital", "nearest_shelter", "operational_hospitals", "isolated_hospitals"):
        val = facts.get(key)
        if isinstance(val, str) and val not in ("not available", ""):
            fact_names_norm.append(_normalise(val))
        elif isinstance(val, list):
            fact_names_norm.extend(_normalise(v) for v in val if v)

    if not fact_names_norm:
        return True   # no names to check against

    # Find "... Hospital" / "... Shelter" / "... School" sequences in the output
    proper_nouns = re.findall(
        r'\b[A-Z][a-zA-Z&\'\.]+(?:\s+[A-Z][a-zA-Z&\'\.]+)*'
        r'\s+(?:Hospital|Shelter|School|Centre|Center|Institute)\b',
        text,
    )
    for noun in proper_nouns:
        noun_norm = _normalise(noun)
        # Accept if noun_norm is a substring of any fact name, or vice-versa
        if not any(
            noun_norm in fn or fn in noun_norm
            for fn in fact_names_norm
        ):
            logger.warning(
                "LLM fallback reason: output contains unrecognised place name '%s' "
                "(not in facts). Facts: %s", noun, fact_names_norm
            )
            return False

    return True


# ── Public API ────────────────────────────────────────────────────────────────

def build_plan(
    simulation: dict,
    mode: str,
    zone_id: str | None,
    facilities: dict,
    zones: list[dict],
) -> dict:
    """
    Build an action plan for authority or citizen mode.

    Parameters
    ----------
    simulation : the full /simulate response dict
    mode       : "authority" | "citizen"
    zone_id    : required when mode == "citizen"
    facilities : facilities dict from app state
    zones      : zones list from app state

    Returns
    -------
    dict matching §6 authority or citizen response shape,
    with source: "llm" | "template"
    """
    # Reload env in case the process started before .env was populated
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.info(
            "LLM fallback reason: GEMINI_API_KEY not set or empty — using template."
        )

    if mode == "authority":
        facts   = _build_authority_facts(simulation, facilities, zones)
        actions = facts["actions"]
        source  = "template"
        summary = facts["summary_template"]

        if api_key:
            facts_text = (
                f"Risk level: {simulation.get('risk', {}).get('level', 'Unknown')}\n"
                f"Hospitals isolated: {', '.join(facts['isolated_hospitals']) or 'none'}\n"
                f"Operational hospitals: {', '.join(facts['operational_hospitals']) or 'none'}\n"
                f"Top {len(actions)} priority actions:\n"
                + "\n".join(
                    f"  {a['rank']}. {a['action']} at {a['target']} — "
                    f"{a['reason']} ({a['est_people']:,} people)"
                    for a in actions
                )
            )
            rewritten = _gemini_rewrite(facts_text, "authority", api_key)
            if rewritten is None:
                logger.info("Authority plan: using template (LLM returned None).")
            elif _validate_llm_output(rewritten, facts):
                summary = rewritten
                source  = "llm"
            else:
                logger.info("Authority plan: using template (LLM output failed validation).")

        return {
            "mode":    "authority",
            "source":  source,
            "actions": actions,
            "summary": summary,
        }

    else:  # citizen
        if not zone_id:
            raise ValueError("zone_id is required for citizen mode")

        facts   = _build_citizen_facts(simulation, zone_id, facilities, zones)
        source  = "template"
        message = facts["template_message"]

        if api_key:
            facts_text = (
                f"Zone: {facts['zone_name']}\n"
                f"Threat level: {facts['risk_level']}\n"
                f"Status: {facts['status']}\n"
                f"Nearest hospital: {facts['nearest_hospital'] or 'not available'}\n"
                f"Nearest shelter: {facts['nearest_shelter'] or 'not available'}\n"
                f"Closed roads: {'; '.join(facts['closed_roads']) or 'none'}\n"
                f"Extra distance to hospital: {facts['extra_km']} km\n"
            )
            rewritten = _gemini_rewrite(facts_text, "citizen", api_key)
            if rewritten is None:
                logger.info("Citizen plan (zone %s): using template (LLM returned None).", zone_id)
            elif _validate_llm_output(rewritten, facts):
                message = rewritten
                source  = "llm"
            else:
                logger.info(
                    "Citizen plan (zone %s): using template (LLM output failed validation).",
                    zone_id,
                )

        return {
            "mode":    "citizen",
            "source":  source,
            "zone":    facts["zone_name"],
            "message": message,
            "facts": {
                "nearest_hospital": facts["nearest_hospital"],
                "nearest_shelter":  facts["nearest_shelter"],
                "closed_roads":     facts["closed_roads"],
            },
        }
