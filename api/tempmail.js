const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = async (req, res) => {
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
};
