/* Screen 7: Learning library. Educational notes are general teaching points, not clinical guidance. */
(function (E) {
  const { h } = E;
  const CREDIT = 'Images: open datasets, CC BY 4.0 (Karim 2025, MSU Scholars Junction).';

  // What to look for and how to hold the probe, per organ. `views` pick images along the stored sweep (0..1).
  const NOTES = {
    Liver: { look: 'Evenly grey tissue with fine texture, a bright thin diaphragm line at the far edge, and hepatic or portal veins as dark tubes with no wall echo.',
      hold: 'Marker towards the patient’s head, just under the right rib margin. Fan the beam up under the ribs and ask for a deep breath in.',
      views: [['Right lobe, sweep start', 0.1], ['Right lobe, mid view', 0.5], ['Right lobe, far view', 0.88]] },
    Gallbladder: { look: 'A dark, pear-shaped sac beside the liver with a bright band behind it. A bright echo with a dark shadow behind it can be a stone.',
      hold: 'Marker towards the head, below the right rib margin in line with the middle of the collarbone. Rotate a little to see the long axis.',
      views: [['Gallbladder, neck', 0.15], ['Gallbladder, body', 0.5], ['Gallbladder, fundus', 0.85]] },
    Kidney: { look: 'A bean-shaped organ: darker outer cortex and pyramids around a bright central sinus. Compare its brightness with the liver or spleen.',
      hold: 'Coronal plane along the side of the body, marker towards the head. Tilt to include the whole kidney from pole to pole.',
      views: [['Kidney, upper pole', 0.12], ['Kidney, mid-section', 0.5], ['Kidney, lower pole', 0.88]] },
    Spleen: { look: 'A smooth crescent of fine, even texture tucked under the diaphragm, next to the upper end of the left kidney.',
      hold: 'Left side, high and towards the back between the lower ribs. Marker towards the head, deep breath in, and keep the probe angled gently upward.',
      views: [['Spleen, upper edge', 0.12], ['Spleen, mid view', 0.5], ['Spleen, lower tip', 0.88]] },
    Pancreas: { look: 'Slightly brighter than the liver, lying in front of the splenic vein. Follow it from head to body to tail.',
      hold: 'Across the upper middle abdomen with the marker to the patient’s right. Use slow, firm-but-gentle pressure to move bowel gas aside.',
      views: [['Pancreas, head', 0.15], ['Pancreas, body', 0.5], ['Pancreas, tail', 0.85]] },
    Pelvis: { look: 'The full bladder is a dark rounded space with sharp walls. It is a useful window to see the structures behind it.',
      hold: 'Just above the pubic bone, probe angled down towards the feet. Scan across, then lengthways.',
      views: [['Bladder, transverse', 0.15], ['Bladder, mid view', 0.5], ['Bladder, deep view', 0.85]] },
    Ovaries: { look: 'Small oval structures beside the uterus with tiny dark follicles. Use the bladder as the window and follow the iliac vessels.',
      hold: 'Above the pubic bone, start across the body, then angle to each side. A full bladder helps.',
      views: [['Ovary, first view', 0.15], ['Ovary, mid view', 0.5], ['Ovary, last view', 0.85]] }
  };

  const buildItems = () => Object.entries(NOTES).flatMap(([organ, n]) => n.views.map(([title, at], i) => ({
    id: `${organ}-${i}`, organ, title, look: n.look, hold: n.hold, image: E.Images.pick(organ, at)
  })));

  function openLarge(item) {
    const dlg = h('dialog', { class: 'modal wide-modal', 'aria-labelledby': 'lib-title' });
    const close = () => { dlg.close(); dlg.remove(); };
    const pic = h('div', { class: 'us-frame' }); E.Images.show(pic, item.image, `${item.title}, ${item.organ} ultrasound`);
    dlg.append(h('div', { class: 'lib-modal' }, pic,
      h('div', null, h('p', { class: 'chip' }, item.organ), h('h2', { id: 'lib-title' }, item.title),
        h('h3', null, 'What to look for'), h('p', null, item.look),
        h('h3', null, 'How to hold the probe'), h('p', null, item.hold),
        !E.Images.available ? h('p', { class: 'notice' }, 'ⓘ Illustrative drawing shown because the image dataset was not found. Run serve.py to see the real images.') : null,
        h('p', { class: 'muted small-text' }, CREDIT, ' Training aid only, not for diagnosis.'),
        h('div', { class: 'row end' }, h('button', { class: 'btn primary', autofocus: true, onClick: close }, 'Close')))));
    dlg.addEventListener('cancel', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
  }

  E.view('library', async () => {
    await E.Images.load();
    const items = buildItems();
    let query = '', organ = 'all';
    const grid = h('div');
    const chipBox = h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Filter by organ' });
    const chips = ['all', ...Object.keys(NOTES)].map((o) => [o, h('button', { class: 'btn small', onClick: () => { organ = o; draw(); } }, o === 'all' ? 'All organs' : o)]);
    chipBox.append(...chips.map((c) => c[1]));
    const search = h('input', { type: 'search', id: 'lib-q', placeholder: 'Search by organ, title or note', onInput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); } });

    function draw() {
      chips.forEach(([o, b]) => b.setAttribute('aria-pressed', String(organ === o)));
      const shown = items.filter((i) => (organ === 'all' || i.organ === organ) && (!query || `${i.organ} ${i.title} ${i.look} ${i.hold}`.toLowerCase().includes(query)));
      if (!shown.length) { grid.replaceChildren(h('div', { class: 'card' }, E.emptyState('⌕', 'No images found', `Nothing matches “${query}”. Try another word or clear the search.`))); return; }
      const groups = [...new Set(shown.map((i) => i.organ))];
      grid.replaceChildren(...groups.map((g) => h('section', { 'aria-labelledby': `g-${g}` },
        h('h2', { id: `g-${g}`, class: 'group-title' }, g),
        h('div', { class: 'grid library' }, shown.filter((i) => i.organ === g).map((i) => {
          const pic = h('div', { class: 'us-frame small' }); E.Images.show(pic, i.image, `${i.title}, ${i.organ} ultrasound`);
          return h('button', { class: 'card lib-card', onClick: () => openLarge(i), 'aria-label': `${i.title}, ${i.organ}. Open larger view` },
            pic, h('strong', null, i.title), h('span', { class: 'muted' }, i.organ), h('span', { class: 'lib-note' }, i.look));
        })))));
    }
    draw();
    return h('div', null, E.pageHead('Learning library', 'Example ultrasound images with notes on what to look for and how to hold the probe.'),
      !E.Images.available ? h('div', { class: 'notice', role: 'status' }, 'ⓘ The image dataset was not found, so illustrative drawings are shown. Start the app with “python web/serve.py” to use the real images.') : null,
      h('div', { class: 'card filters' }, h('div', { class: 'field grow' }, h('label', { for: 'lib-q' }, 'Search'), search), chipBox),
      grid, h('p', { class: 'muted small-text' }, CREDIT));
  });
})(globalThis.Echo = globalThis.Echo || {});
