export default async function handler(req, res) {
  const { key, license_key } = req.body || {};
  const userKey = (key || license_key || "").trim();

  if (!userKey) {
    return res.status(200).json({ ok: false, code: "invalid" });
  }

  // Hardcoded Product IDs (TabPro + Gift Pack)
  const PRODUCT_IDS = [
    "JBxm61TbS3NKHbz_z_ipiw==", // Gift Pack Product ID
    "zgwlxb",                    // Gift Pack Permalink ID
    "osigys"                     // TabPro Product ID
  ];

  try {
    for (const productId of PRODUCT_IDS) {
      const response = await fetch("https://api.gumroad.com/v2/licenses/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          product_id: productId,
          license_key: userKey
        })
      });

      const data = await response.json();

      if (data.success && !data.purchase.refunded && !data.purchase.chargebacked) {
        return res.status(200).json({
          ok: true,
          key: userKey,
          uses: data.purchase.uses,
          message: "License verified successfully"
        });
      }
    }

    return res.status(200).json({ ok: false, code: "invalid" });
  } catch (error) {
    return res.status(502).json({ ok: false, code: "upstream" });
  }
}
