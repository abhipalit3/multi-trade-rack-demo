// chatInterface.js

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * @param {object}   params        Your GUI params object
 * @param {function} rebuildScene  The function returned by setupGUI()
 * @param {function} [updateGUI]   Optional: callback to sync sliders
 */
export function initChatInterface(params, rebuildScene, updateGUI) {
  let apiKey = '';

  // Build the widget container
  const container = document.createElement('div');
  Object.assign(container.style, {
    position:      'absolute',
    top:           '80px',
    left:          '40px',
    width:         '320px',
    maxHeight:     '60vh',
    background:    'rgba(255,255,255,0.95)',
    border:        '1px solid #ccc',
    borderRadius:  '4px',
    display:       'flex',
    flexDirection: 'column',
    fontFamily:    'sans-serif',
    zIndex:        '1000',
    boxShadow:     '0 2px 8px rgba(0,0,0,0.2)'
  });
  document.body.appendChild(container);

  // Heading
  const title = document.createElement('h3');
  title.textContent = 'configur. AI Assistant';
  Object.assign(title.style, {
    margin:       '0',
    padding:      '12px 8px',
    fontSize:     '1.1em',
    background:   '#f0f0f0',
    borderBottom:'1px solid #ddd'
  });
  container.appendChild(title);

  // API key input
  const header = document.createElement('div');
  header.style.padding = '8px';
  header.innerHTML = `
    <label style="font-size:0.9em">OpenAI API Key:</label>
    <input type="password" id="openai-key"
           style="width:100%; box-sizing:border-box"
           placeholder="sk-…" />
  `;
  container.appendChild(header);

  // Message log
  const messages = document.createElement('div');
  Object.assign(messages.style, {
    flex:         '1',
    overflowY:    'auto',
    padding:      '8px',
    borderTop:    '1px solid #eee',
    borderBottom: '1px solid #eee',
    fontSize:     '0.9em'
  });
  container.appendChild(messages);

  // Input form
  const form = document.createElement('form');
  form.style.display = 'flex';
  form.style.padding = '8px';
  container.appendChild(form);

  const input = document.createElement('input');
  Object.assign(input.style, {
    flex:        '1',
    marginRight: '4px',
    boxSizing:   'border-box'
  });
  input.placeholder = 'Describe your change…';
  form.appendChild(input);

  const send = document.createElement('button');
  send.type = 'submit';
  send.textContent = 'Send';
  form.appendChild(send);

  form.addEventListener('submit', async e => {
    e.preventDefault();

    // 1. Obtain API key once
    if (!apiKey) {
      apiKey = document.getElementById('openai-key').value.trim();
      if (!apiKey) {
        alert('Please enter a valid OpenAI API key.');
        return;
      }
    }

    // 2. Echo user message
    const userMessage = input.value.trim();
    if (!userMessage) return;
    append('User', userMessage);
    input.value = '';

    // 3. Show params shortcut
    if (userMessage.toLowerCase().includes('show params')) {
      append('Assistant', '```json\n' + JSON.stringify(params, null, 2) + '\n```');
      append('Assistant', 'done.');
      return;
    }

    // 4. Send to OpenAI
    append('Assistant', '…');

    // Capture current params snapshot
    const currentParams = JSON.stringify(params);

    console.log('Sending to OpenAI:', {params});

    let aiRaw;
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
`You are an assistant that modifies a JavaScript params object.  

CURRENT PARAMS:
${currentParams}

VALID TOP-LEVEL KEYS:
  corridorWidth, corridorHeight,
  bayCount, bayWidth,
  depth, topClearance,
  postSize, beamSize,
  tierCount

VALID PER-TIER KEYS (with "tier":1-based index):
  tierHeights (ft),
  ductEnabled (bool),
  ductWidths (in),
  ductHeights (in),
  ductOffsets (in),
  pipeEnabled (bool),
  pipesPerTier (array of { diam:in, side:in, vert:in })

When you respond, output exactly one JSON object containing only the keys to change.
No extra text, no markdown fences.`
            },
            { role: 'user', content: userMessage }
          ]
        })
      });

      const { choices } = await response.json();
      aiRaw = choices[0].message.content.trim();
    } catch (err) {
      console.error(err);
      append('Assistant', 'Error: ' + err.message);
      return;
    }

    // 5. Strip any fences
    const clean = aiRaw
      .replace(/^```json\s*/, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();

    // 6. Show JSON back
    messages.lastChild.textContent = '';
    append('Assistant', '```json\n' + clean + '\n```');

    // 7. Parse and apply
    let updates;
    try {
      updates = JSON.parse(clean);
    } catch (err) {
      console.error('Parse error', err);
      append('Assistant', 'Error: invalid JSON.');
      return;
    }

    // 7a. Per-tier patches
    if ('tier' in updates) {
      const t = updates.tier - 1;
      for (const key of [
        'tierHeights','ductEnabled','ductWidths',
        'ductHeights','ductOffsets','pipeEnabled'
      ]) {
        if (key in updates) {
          if (!Array.isArray(params[key])) params[key] = [];
          params[key][t] = updates[key];
          delete updates[key];
        }
      }
      if ('pipesPerTier' in updates) {
        if (!Array.isArray(params.pipesPerTier)) params.pipesPerTier = [];
        params.pipesPerTier[t] = updates.pipesPerTier;
        delete updates.pipesPerTier;
      }
      delete updates.tier;
    }

    // 7b. Top-level keys
    for (const [k,v] of Object.entries(updates)) {
      if (k in params) {
        params[k] = v;
      }
    }

    // 8. Sync GUI sliders
    if (typeof updateGUI === 'function') {
      updateGUI(updates);
    }

    // 9. Rebuild scene
    rebuildScene();
  });

  function append(author, text) {
    const msg = document.createElement('div');
    msg.style.marginBottom = '4px';
    msg.innerHTML = `<strong>${author}:</strong> ${text}`;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }
}
