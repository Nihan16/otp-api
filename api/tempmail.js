import fetch from "node-fetch";

export default async function handler(req, res) {
  // CORS headers যোগ করুন
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: "Missing email parameter" });
  }

  try {
    const response = await fetch(
      `https://tempmail.plus/api/mails?email=${email}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
