# FeeSaver IP Whitelist Troubleshooting

## Problem
Getting error: "Access to the API is only possible through a whitelist of IP addresses"

## Solution

### Step 1: Check your server's public IP

Run this script on your server:
```bash
node .claude/check-ip.js
```

This will show:
- Your public IP address
- Whether FeeSaver API is accessible
- If you're behind a proxy/Cloudflare

### Step 2: Common scenarios

#### Scenario A: Direct server (no proxy)
If you see:
```
1. Checking IP via ipify.org...
   IP: 162.55.43.153
```

Then ask FeeSaver support to whitelist: **162.55.43.153**

#### Scenario B: Behind Cloudflare
If your bot backend is proxied through Cloudflare, you have 2 options:

**Option 1: Bypass Cloudflare for FeeSaver** (recommended)
- Create a separate subdomain `api.yourdomain.com`
- Point it directly to your server IP (no orange cloud in Cloudflare)
- Use this for FeeSaver API calls

**Option 2: Use Cloudflare's egress IPs**
- Ask FeeSaver to whitelist Cloudflare's IP ranges
- Not recommended (large IP range)

#### Scenario C: Multiple server IPs
If your server has multiple IPs (IPv4 + IPv6):
```
162.55.43.153  (IPv4)
2a01:4f8:xxx   (IPv6)
89.23.119.71   (backup IP?)
```

Ask FeeSaver to whitelist **ALL** of them.

### Step 3: Test FeeSaver access

After whitelisting, test:
```bash
curl "https://api.feesaver.com/balance?token=YOUR_API_KEY"
```

Should return:
```json
{
  "balance_trx": 123.45,
  "user_id": 12345
}
```

### Step 4: Verify in bot

Restart your bot and check logs:
```bash
pm2 logs keyshield --lines 50
```

Look for:
```
✅ FeeSaver balance: 123.45 TRX
```

## Current Status

Your reported IPs:
- 162.55.43.153 ✅ (whitelisted?)
- 89.23.119.71 ✅ (whitelisted?)

But still getting error → **likely behind Cloudflare proxy**

## Action Items

1. Run `node .claude/check-ip.js` on server
2. Check if Cloudflare proxy is enabled
3. Send actual IP to FeeSaver support
4. Wait for confirmation
5. Test with curl
6. Restart bot

## Contact FeeSaver Support

Email: support@feesaver.com
Message: "Please whitelist IP address X.X.X.X for API key [your_key]"
