// Site configuration, loaded from content/manifest.json.

export const config = {
  owner: {
    name: 'Chase Hanson',
    handle: 'ChaseHCS',
    organization: '',
    title: 'Cybersecurity Researcher',
  },
  settings: {
    // "once" = full boot sequence on the first visit of a browser session,
    // "always" = every load, "never" = straight to the desktop.
    bootScreen: 'once',
    showExtensions: false,
    sounds: true,
    welcomeScreen: true,
    driveLabel: '',
  },
  writeups: [],
  documents: [],
  links: [],
};

export async function loadConfig() {
  try {
    const res = await fetch('content/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    Object.assign(config.owner, data.owner || {});
    Object.assign(config.settings, data.settings || {});
    config.writeups = data.writeups || [];
    config.documents = data.documents || [];
    config.links = data.links || [];
  } catch (err) {
    console.error('Could not load content/manifest.json', err);
  }
  return config;
}
