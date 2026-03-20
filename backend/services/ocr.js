// Claude Vision OCR — ported and improved from Phase 0 POC

function buildPrompt(contextKm) {
  if (contextKm) {
    const prefix = String(contextKm).slice(0, -3);
    return `This is a car odometer display.
Context: the reading should be close to ${contextKm} km. The first digits are likely "${prefix}".
Use this to resolve any ambiguous digits — only the last 2-3 digits should differ.
Read the total km value shown.
Return ONLY valid JSON with no markdown:
{"km": 45312, "confidence": "high", "crop": {"top": 0.38, "bottom": 0.62, "left": 0.08, "right": 0.92}}
crop defines the rectangle around ONLY the km digits (top/bottom/left/right as fractions 0–1).
Confidence "high" if clearly readable, "low" if uncertain.
If unreadable: {"km": null, "confidence": "none", "crop": null}`;
  }

  return `This is a car odometer display.
Read the total km value shown.
Return ONLY valid JSON with no markdown:
{"km": 45312, "confidence": "high", "crop": {"top": 0.38, "bottom": 0.62, "left": 0.08, "right": 0.92}}
crop defines the rectangle around ONLY the km digits (top/bottom/left/right as fractions 0–1).
Confidence "high" if clearly readable, "low" if uncertain.
If unreadable: {"km": null, "confidence": "none", "crop": null}`;
}

function parseResponse(text) {
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

async function readOdometer(imageBase64, mimeType = 'image/jpeg', contextKm = null) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: buildPrompt(contextKm) },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Claude API error ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const raw  = data.content?.[0]?.text ?? '';
  const result = parseResponse(raw);

  return { ...result, raw };
}

module.exports = { readOdometer };
