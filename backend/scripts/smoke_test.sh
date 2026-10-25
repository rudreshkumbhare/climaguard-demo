#!/usr/bin/env bash
# smoke_test.sh — Curl tests for every ClimaguardAI API endpoint.
# Run from the repo root: bash backend/scripts/smoke_test.sh
# The server must be running: uvicorn app.main:app --port 8000

BASE="http://localhost:8000/api"
SEP="─────────────────────────────────────────────"
PASS=0
FAIL=0

check() {
    local label="$1"
    local code="$2"
    local expected="$3"
    if [ "$code" = "$expected" ]; then
        echo "  ✅ HTTP $code  — $label"
        PASS=$((PASS+1))
    else
        echo "  ❌ HTTP $code (expected $expected) — $label"
        FAIL=$((FAIL+1))
    fi
}

echo ""
echo "═══════════════════════════════════════════════"
echo "  ClimaguardAI API smoke tests"
echo "═══════════════════════════════════════════════"

# ── 1. GET /health ────────────────────────────────
echo ""
echo "$SEP"
echo "1. GET /health"
echo "$SEP"
CODE=$(curl -s -o /tmp/cg_resp.json -w "%{http_code}" "$BASE/health")
check "GET /health" "$CODE" "200"
python3 -c "import json,sys; d=json.load(open('/tmp/cg_resp.json')); print('  ', d)"

# ── 2. GET /region ────────────────────────────────
echo ""
echo "$SEP"
echo "2. GET /region  (large payload, gzip-compressed)"
echo "$SEP"
CODE=$(curl -s -o /tmp/cg_resp.json -w "%{http_code}" \
     --compressed "$BASE/region")
check "GET /region" "$CODE" "200"
python3 -c "
import json,sys
d=json.load(open('/tmp/cg_resp.json'))
print('  bbox:', d.get('bbox'))
print('  hospitals:', len(d.get('hospitals',[])))
print('  shelters:', len(d.get('shelters',[])))
print('  zones:', len(d.get('zones',[])))
print('  road features:', len(d.get('roads',{}).get('features',[])))
"

# ── 3. GET /weather/live ──────────────────────────
echo ""
echo "$SEP"
echo "3. GET /weather/live?lat=19.05&lon=72.86"
echo "$SEP"
CODE=$(curl -s -o /tmp/cg_resp.json -w "%{http_code}" "$BASE/weather/live?lat=19.05&lon=72.86")
check "GET /weather/live" "$CODE" "200"
python3 -c "import json; d=json.load(open('/tmp/cg_resp.json')); print('  ', d)"

# ── 4. POST /simulate (Compound event preset) ──────
echo ""
echo "$SEP"
echo "4. POST /simulate  (Compound event: rain=90, surge=2.5, tide=3.0)"
echo "$SEP"
CODE=$(curl -s -o /tmp/cg_simulate.json -w "%{http_code}" \
  --compressed \
  -X POST "$BASE/simulate" \
  -H "Content-Type: application/json" \
  -d '{"rain_mm_hr": 90, "surge_m": 2.5, "tide_m": 3.0, "rain_increase_pct": 0, "sea_level_rise_m": 0}')
check "POST /simulate (compound)" "$CODE" "200"
python3 -c "
import json
d=json.load(open('/tmp/cg_simulate.json'))
r=d.get('risk',{})
f=d.get('flood',{})
c=d.get('cascade',{}).get('metrics',{})
print('  inputs_effective:', d.get('inputs_effective'))
print('  risk.level:', r.get('level'), ' compound:', round(r.get('compound',0),4), ' baseline:', round(r.get('baseline',0),4))
print('  roads_closed_pct:', f.get('roads_closed_pct'), '%')
print('  hospitals_isolated:', c.get('hospitals_isolated'))
print('  zones_cut_off:', c.get('zones_cut_off'))
print('  population_isolated:', c.get('population_isolated'))
print('  compute_ms:', d.get('compute_ms'))
"

# ── 5. POST /simulate (Normal preset) ─────────────
echo ""
echo "$SEP"
echo "5. POST /simulate  (Normal: rain=10, surge=0, tide=0.5)"
echo "$SEP"
CODE=$(curl -s -o /tmp/cg_resp.json -w "%{http_code}" \
  -X POST "$BASE/simulate" \
  -H "Content-Type: application/json" \
  -d '{"rain_mm_hr": 10, "surge_m": 0, "tide_m": 0.5}')
check "POST /simulate (normal)" "$CODE" "200"
python3 -c "
import json
d=json.load(open('/tmp/cg_resp.json'))
r=d.get('risk',{})
print('  level:', r.get('level'), 'compound:', round(r.get('compound',0),4))
print('  roads_closed_pct:', d.get('flood',{}).get('roads_closed_pct'))
"

# ── 6. POST /plan (Authority, Compound event) ──────
echo ""
echo "$SEP"
echo "6. POST /plan  mode=authority  (Compound event body)"
echo "$SEP"

SIMULATE_JSON=$(cat /tmp/cg_simulate.json)

CODE=$(curl -s -o /tmp/cg_resp.json -w "%{http_code}" \
  -X POST "$BASE/plan" \
  -H "Content-Type: application/json" \
  --data-binary "{\"simulation\": $SIMULATE_JSON, \"mode\": \"authority\"}")
check "POST /plan (authority)" "$CODE" "200"
python3 -c "
import json
d=json.load(open('/tmp/cg_resp.json'))
print('  mode:', d.get('mode'))
print('  source:', d.get('source'))
print('  actions count:', len(d.get('actions',[])))
if d.get('actions'):
    a=d['actions'][0]
    print('  top action:', a.get('rank'), a.get('action'), '->', a.get('target'))
print('  summary (first 150 chars):', str(d.get('summary',''))[:150])
"

# ── 7. POST /plan (Citizen, zone z1 Dharavi) ──────
echo ""
echo "$SEP"
echo "7. POST /plan  mode=citizen  zone_id=z1 (Dharavi)"
echo "$SEP"

CODE=$(curl -s -o /tmp/cg_resp.json -w "%{http_code}" \
  -X POST "$BASE/plan" \
  -H "Content-Type: application/json" \
  --data-binary "{\"simulation\": $SIMULATE_JSON, \"mode\": \"citizen\", \"zone_id\": \"z1\"}")
check "POST /plan (citizen, z1)" "$CODE" "200"
python3 -c "
import json
d=json.load(open('/tmp/cg_resp.json'))
print('  mode:', d.get('mode'))
print('  source:', d.get('source'))
print('  zone:', d.get('zone'))
print('  message (first 200 chars):', str(d.get('message',''))[:200])
print('  facts:', d.get('facts'))
"

# ── 8. POST /plan (Citizen, zone z3 Kurla West) ───
echo ""
echo "$SEP"
echo "8. POST /plan  mode=citizen  zone_id=z3 (Kurla West)"
echo "$SEP"
CODE=$(curl -s -o /tmp/cg_resp.json -w "%{http_code}" \
  -X POST "$BASE/plan" \
  -H "Content-Type: application/json" \
  --data-binary "{\"simulation\": $SIMULATE_JSON, \"mode\": \"citizen\", \"zone_id\": \"z3\"}")
check "POST /plan (citizen, z3)" "$CODE" "200"
python3 -c "
import json
d=json.load(open('/tmp/cg_resp.json'))
print('  mode:', d.get('mode'))
print('  source:', d.get('source'))
print('  zone:', d.get('zone'))
print('  message (first 200 chars):', str(d.get('message',''))[:200])
"

# ── 9. Error: POST /plan without zone_id ──────────
echo ""
echo "$SEP"
echo "9. POST /plan  mode=citizen  (missing zone_id — expect 400)"
echo "$SEP"
CODE=$(curl -s -o /tmp/cg_resp.json -w "%{http_code}" \
  -X POST "$BASE/plan" \
  -H "Content-Type: application/json" \
  --data-binary "{\"simulation\": $SIMULATE_JSON, \"mode\": \"citizen\"}")
check "POST /plan (missing zone_id)" "$CODE" "400"   # returns 400 with error body
python3 -c "import json; d=json.load(open('/tmp/cg_resp.json')); print('  ', d)"

# ── 10. Error: POST /simulate bad body ────────────
echo ""
echo "$SEP"
echo "10. POST /simulate  (bad body — expect 422)"
echo "$SEP"
CODE=$(curl -s -o /tmp/cg_resp.json -w "%{http_code}" \
  -X POST "$BASE/simulate" \
  -H "Content-Type: application/json" \
  -d '{"rain_mm_hr": "not_a_number"}')
check "POST /simulate (bad body)" "$CODE" "422"
python3 -c "import json; d=json.load(open('/tmp/cg_resp.json')); print('  detail type:', type(d.get('detail')).__name__)"

# ── BONUS: /plan with GEMINI_API_KEY unset ────────
echo ""
echo "$SEP"
echo "BONUS. POST /plan (authority) with GEMINI_API_KEY unset"
echo "$SEP"
GEMINI_API_KEY="" CODE=$(GEMINI_API_KEY="" curl -s -o /tmp/cg_resp.json -w "%{http_code}" \
  -X POST "$BASE/plan" \
  -H "Content-Type: application/json" \
  --data-binary "{\"simulation\": $SIMULATE_JSON, \"mode\": \"authority\"}")
# Note: env var unset test must be done server-side; client unset has no effect.
# We show current source from the live server to confirm template fallback is handled.
python3 -c "
import json
d=json.load(open('/tmp/cg_resp.json'))
print('  source (with key set on server):', d.get('source'))
print('  (To test template: restart server with GEMINI_API_KEY unset)')
"

echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════"
echo ""
