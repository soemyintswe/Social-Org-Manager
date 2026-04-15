# Render Option B (All-in-one) Deployment Guide

ဒီ setup မှာ Frontend (Expo Web Build) + Express API ကို Render Web Service တစ်ခုတည်းမှာ run ပါမယ်။

## 1) Build/Start Artifacts

- `render.yaml` ကို repo root မှာ ထည့်ထားပြီး:
  - build: `npm ci && npm run render:build`
  - start: `npm run render:start`
  - health check: `/api/sync/health`
  - persistent disk: `/var/data/orghub` (snapshot data မပျောက်အောင်)

- `package.json` scripts အသစ်:
  - `render:build` = `npm run web:build && npm run server:build`
  - `render:start` = `node server_dist/index.cjs`

## 2) Environment Variables Checklist (Render Dashboard)

### Required (အနည်းဆုံးလိုအပ်)

1. `EXPO_PUBLIC_SYNC_SERVER_URL`
   - တိတိကျကျ `https://<your-service>.onrender.com`
   - ဥပမာ `https://social-org-manager.onrender.com`
2. `EXPO_PUBLIC_MANAGED_ORG_CONFIGS`
   - JSON object string (ORG001/ORG002 config map)
3. `EXPO_PUBLIC_FIREBASE_CONFIG_JSON`
   - Firebase web config JSON (Org Registry / License checks အတွက်)
4. `EXPO_PUBLIC_USE_MANAGED_ORG_CONFIGS`
   - `true`
5. `NODE_ENV`
   - `production`
6. `ORGHUB_BASE_DIR`
   - `/opt/render/project/src`
7. `ORGHUB_DATA_DIR`
   - `/var/data/orghub`

### Strongly Recommended

1. `EXPO_PUBLIC_MANAGED_SYNC_LOCKDOWN_ENABLED=true`
2. `EXPO_PUBLIC_SERVER_API_URL=https://<your-service>.onrender.com`
3. `ORGHUB_RATE_LIMIT_MAX=240`
4. `ORGHUB_API_RATE_LIMIT_MAX=120`
5. `ORGHUB_SNAPSHOT_WRITE_RATE_LIMIT_MAX=30`
6. `ORGHUB_CLOUD_PROXY_RATE_LIMIT_MAX=20`

### Cold Start Tuning (Render spin-down အတွက်)

1. `EXPO_PUBLIC_SYNC_REQUEST_TIMEOUT_MS=45000`
2. `EXPO_PUBLIC_RENDER_COLD_START_TIMEOUT_MS=45000`
3. `EXPO_PUBLIC_RENDER_COLD_START_ATTEMPTS=8`
4. `EXPO_PUBLIC_RENDER_COLD_START_BASE_DELAY_MS=1200`
5. `EXPO_PUBLIC_RENDER_COLD_START_WARMUP_TTL_MS=600000`
6. `ORGHUB_CLOUD_PROXY_TIMEOUT_MS=70000`

## 3) Step-by-step Deploy

1. GitHub repo ကို push လုပ်ပါ (including `render.yaml` changes)။
2. Render Dashboard > `New` > `Blueprint` > repo ရွေးပါ။
3. `render.yaml` preview ထဲက
   - service name စစ်ပါ
   - `EXPO_PUBLIC_SYNC_SERVER_URL` ကို သင့် Render domain နဲ့အစားထိုးပါ။
4. Create blueprint လုပ်ပြီး build ပြီးသည်အထိစောင့်ပါ။
5. Build ပြီးသွားပြီး Domain ရလာရင် Dashboard env vars တွေထဲမှာ
   - `EXPO_PUBLIC_SYNC_SERVER_URL`
   - `EXPO_PUBLIC_SERVER_API_URL` (အသုံးပြုမယ်ဆို)
   ကို final domain နဲ့ပြန်စစ်ပြီး redeploy တစ်ခါလုပ်ပါ။
6. Health check စစ်ပါ:
   - `https://<your-service>.onrender.com/api/sync/health`
   - `{ ok: true }` ပြန်ရရမယ်။
7. Web app စမ်းသပ်ပါ:
   - `https://<your-service>.onrender.com/admin-sign-in`
   - `https://<your-service>.onrender.com/ORG001`
   - `https://<your-service>.onrender.com/ORG002`
8. Sync verification (post-deploy):
   - ORG001/ORG002 နဲ့ login ဝင်ပြီး manual sync push/pull စမ်းပါ။
   - scope meta (`@orghub_sync_scope_meta`) orgId က org တိုင်းကိုက်နေမနေ စစ်ပါ။

## 4) Notes

- `EXPO_PUBLIC_*` vars များက web build-time ပါဝင်သွားတဲ့အတွက် value ပြောင်းပြီးရင် redeploy လိုအပ်နိုင်ပါတယ်။
- Render free tier မှာ spin-down ဖြစ်နိုင်လို့ ပထမ request သာမန်ထက်နောက်ကျနိုင်ပါတယ် (cold start)။
