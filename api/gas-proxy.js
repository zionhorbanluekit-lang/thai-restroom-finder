// /api/gas-proxy.js
// ---------------------------------------------------------------------
// ✅ This Vercel API route proxies requests to Google Apps Script
// ✅ It fixes the CORS issue (browser -> vercel domain -> Google Script)
// ---------------------------------------------------------------------

export default async function handler(req, res) {
  // 🔗 Your Deployed Google Apps Script Web App URL
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyDS083V8prS-oLLfiMPwZW8t_PKiNvsRu00Mb3M_-dU6zcqB192S_1pIUIX_wtkZ3r/exec';

  // ✅ Add CORS headers so browsers can talk to your own domain safely
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Handle preflight (OPTIONS) request instantly
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ✅ Forward the request to your Google Apps Script backend
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?t=${Date.now()}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });

    const text = await response.text();

    // ✅ Try to send JSON if possible, fallback to text
    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      return res.status(200).send(text);
    }

  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
