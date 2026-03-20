const SIMPLE_PROMPT = `This is a car odometer display.
Read the total km value shown.
Return ONLY valid JSON with no markdown, no explanation:
{"km": 45312, "confidence": "high", "crop": {"top": 0.38, "bottom": 0.62, "left": 0.08, "right": 0.92}}
crop defines the rectangle containing ONLY the km digits (not the full dashboard).
top/bottom/left/right are fractions of image height/width from the top-left corner (0=edge, 1=opposite edge).
Confidence is "high" if clearly readable, "low" if uncertain.
If unreadable return {"km": null, "confidence": "none", "crop": null}`;

function buildContextPrompt(prefixDigits) {
  return `This is a car odometer display.
The odometer reading starts with the digits: ${prefixDigits}
Use this as context to resolve any ambiguity in the remaining digits.
Read the total km value shown.
Return ONLY valid JSON with no markdown, no explanation:
{"km": 45312, "confidence": "high", "crop": {"top": 0.38, "bottom": 0.62, "left": 0.08, "right": 0.92}}
crop defines the rectangle containing ONLY the km digits (not the full dashboard).
top/bottom/left/right are fractions of image height/width from the top-left corner (0=edge, 1=opposite edge).
Confidence is "high" if clearly readable, "low" if uncertain.
If unreadable return {"km": null, "confidence": "none", "crop": null}`;
}

function parseClaudeJson(text) {
  try {
    return JSON.parse(text.trim());
  } catch {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { image, mimeType = 'image/jpeg', useContext, prefixDigits } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: 'No image provided' });
  }

  const prompt = (useContext && prefixDigits)
    ? buildContextPrompt(prefixDigits)
    : SIMPLE_PROMPT;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Claude API error:', response.status, detail);
      return res.status(502).json({ error: `Claude API error: ${response.status}`, detail });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text ?? '';
    const result = parseClaudeJson(rawText);

    res.json({ result, raw: rawText });
  } catch (err) {
    console.error('OCR handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
