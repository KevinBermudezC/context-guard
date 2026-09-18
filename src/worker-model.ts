import { CONFIG } from './config.js';

export async function callWorkerModel(content: string, query: string = '', ext: string = ''): Promise<string> {
  const systemPrompt = `Eres ContextGuard, un asistente de optimización de contexto y costes para IA.
Tu misión es procesar un archivo grande y devolver ÚNICAMENTE una representación ultra compacta y precisa para el modelo principal.
Reglas:
1. Incluye las firmas de funciones y métodos, clases, tipos, interfaces y rutas expuestas.
2. Anota los números de línea aproximados donde se ubica cada sección.
3. Omite implementaciones internas, boilerplate, logs repetitivos o comentarios innecesarios.
4. Si se proporcionó una intención/query, enfócate estrictamente en lo relevante para esa intención.
5. Responde directamente con Markdown conciso, sin preámbulos ni saludos.`;

  const userPrompt = query 
    ? `INTENCIÓN ESPECÍFICA: "${query}"\n\nCONTENIDO DEL ARCHIVO (${ext}):\n\`\`\`\n${content}\n\`\`\``
    : `Genera un mapa de estructura y firmas con números de línea para este archivo (${ext}):\n\`\`\`\n${content}\n\`\`\``;

  // 1. Proveedor Gemini Flash
  if (CONFIG.provider === 'gemini') {
    if (!CONFIG.geminiApiKey) {
      throw new Error('GEMINI_API_KEY no configurada. Define la variable de entorno o usa CONFIG_GUARD_PROVIDER=skeleton.');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1500 }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Error en Gemini Flash API: ${res.status} - ${err}`);
    }
    const data = await res.json() as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No se pudo generar el resumen.';
  }

  // 2. Proveedor Ollama Local (0 costo / offline)
  if (CONFIG.provider === 'ollama') {
    const res = await fetch(`${CONFIG.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.ollamaModel,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false
      })
    });
    if (!res.ok) {
      throw new Error(`Error conectando con Ollama en ${CONFIG.ollamaUrl}`);
    }
    const data = await res.json() as any;
    return data.response || 'No se pudo generar el resumen.';
  }

  // 3. Proveedor OpenAI / compatible
  if (CONFIG.provider === 'openai') {
    const baseUrl = CONFIG.openaiBaseUrl || 'https://api.openai.com/v1';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.openaiApiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1500
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Error en API OpenAI/compatible: ${res.status} - ${err}`);
    }
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content || 'No se pudo generar el resumen.';
  }

  throw new Error(`Proveedor no soportado: ${CONFIG.provider}`);
}
