/* Cria a fonte virtual "SomDoSistema" (= espelho da saída de áudio atual).
   É o equivalente automático de:
     pactl load-module module-remap-source master=<saída>.monitor source_name=xora_sistema ...
   Funciona em PipeWire (via pipewire-pulse) e PulseAudio. */
const { execFile, execFileSync } = require('child_process');

const SOURCE_NAME = 'xora_sistema';
const DESCRIPTION = 'SomDoSistema';

let moduleId = null;
let currentSink = null;
let timer = null;
let status = { ok: false, reason: 'Som do sistema ainda não iniciado.' };

// dentro do AppImage o LD_LIBRARY_PATH pode apontar p/ libs do app e quebrar o pactl do sistema
function cleanEnv() {
  const env = { ...process.env };
  if (env.APPDIR && env.LD_LIBRARY_PATH) {
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH.split(':').filter(p => p && !p.startsWith(env.APPDIR)).join(':');
    if (!env.LD_LIBRARY_PATH) delete env.LD_LIBRARY_PATH;
  }
  return env;
}

function pactl(args) {
  return new Promise((resolve, reject) => {
    execFile('pactl', args, { timeout: 5000, env: cleanEnv() }, (err, stdout, stderr) => {
      if (err) { err.stderrText = (stderr || '').trim(); return reject(err); }
      resolve(String(stdout).trim());
    });
  });
}

async function defaultSink() {
  try {
    const s = await pactl(['get-default-sink']);
    if (s) return s;
  } catch (e) { if (e.code === 'ENOENT') throw e; }
  const info = await pactl(['info']);                       // servidores mais antigos
  const m = info.match(/^Default Sink:\s*(.+)$/m);
  if (!m) throw new Error('Não achei a saída de áudio padrão.');
  return m[1].trim();
}

async function unloadStale() {
  const out = await pactl(['list', 'short', 'modules']);
  for (const line of out.split('\n')) {
    if (line.includes('source_name=' + SOURCE_NAME)) {
      await pactl(['unload-module', line.split('\t')[0]]).catch(() => {});
    }
  }
  moduleId = null;
}

async function load(sink) {
  const id = await pactl([
    'load-module', 'module-remap-source',
    `master=${sink}.monitor`,
    `source_name=${SOURCE_NAME}`,
    `source_properties=device.description=${DESCRIPTION}`,
  ]);
  moduleId = id;
  currentSink = sink;
}

async function refresh() {
  try {
    const sink = await defaultSink();
    if (moduleId && sink === currentSink) return;           // nada mudou
    await unloadStale();
    await load(sink);
    status = { ok: true, reason: '' };
  } catch (e) {
    if (e.code === 'ENOENT') {
      status = { ok: false, reason:
        'O programa "pactl" não está instalado. Instale o pacote "pulseaudio-utils" (Debian/Ubuntu/Fedora) ou "libpulse" (Arch) e reabra o app.' };
    } else {
      status = { ok: false, reason: 'Não consegui criar o SomDoSistema: ' + (e.stderrText || e.message) };
    }
  }
}

function start() {
  if (process.platform !== 'linux') { status = { ok: true, reason: '' }; return; }
  refresh();
  timer = setInterval(refresh, 4000);                        // acompanha troca de fone/caixa
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  if (process.platform !== 'linux' || !moduleId) return;
  try { execFileSync('pactl', ['unload-module', moduleId], { timeout: 3000, env: cleanEnv() }); } catch (_) {}
  moduleId = null;
}

module.exports = { start, stop, getStatus: () => status };
