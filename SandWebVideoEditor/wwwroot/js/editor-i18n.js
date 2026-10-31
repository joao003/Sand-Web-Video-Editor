(function (root) {
  'use strict';

  const STORAGE_KEY = 'sand.lang';
  const DEFAULT_LANG = 'pt';
  const LANGS = { pt: { label: 'Português', html: 'pt-BR' }, en: { label: 'English', html: 'en' } };
  const CODES = Object.keys(LANGS);

  const MESSAGES = {

    'nav.toggle': ['Alternar navegação', 'Toggle navigation'],
    'menu.file': ['Arquivo', 'File'],
    'menu.edit': ['Editar', 'Edit'],
    'menu.new': ['Novo Projeto', 'New Project'],
    'menu.open': ['Abrir Projeto', 'Open Project'],
    'menu.save': ['Salvar Projeto', 'Save Project'],
    'menu.export': ['Exportar Vídeo', 'Export Video'],
    'menu.undo': ['Desfazer (Ctrl+Z)', 'Undo (Ctrl+Z)'],
    'menu.redo': ['Refazer (Ctrl+Y)', 'Redo (Ctrl+Y)'],
    'menu.copy': ['Copiar (Ctrl+C)', 'Copy (Ctrl+C)'],
    'menu.paste': ['Colar (Ctrl+V)', 'Paste (Ctrl+V)'],
    'menu.cut': ['Recortar (Ctrl+X)', 'Cut (Ctrl+X)'],
    'menu.delete': ['Excluir (Del)', 'Delete (Del)'],
    'menu.split': ['Dividir no cursor (S)', 'Split at cursor (S)'],
    'menu.fullscreen': ['Tela cheia (F)', 'Fullscreen (F)'],
    'project.defaultName': ['Novo Projeto', 'New Project'],
    'project.fallbackName': ['Projeto', 'Project'],

    'coll.title': ['Coleção de Mídia', 'Media Collection'],
    'coll.addTitle': ['+ Título', '+ Title'],
    'coll.help': [
      'Envie arquivos de vídeo (.mp4, .mov, .mkv, .webm e .avi), áudio (.mp3, .wav, .m4a, .aac e .ogg) ou imagem (.png, .jpg, .jpeg, .webp e .bmp) para adicionar à coleção.',
      'Upload video files (.mp4, .mov, .mkv, .webm and .avi), audio files (.mp3, .wav, .m4a, .aac and .ogg) or images (.png, .jpg, .jpeg, .webp and .bmp) to add them to the collection.'],
    'media.image': ['Imagem', 'Image'],
    'media.remove': ['Remover da coleção', 'Remove from collection'],
    'media.add': ['Adicionar à timeline', 'Add to timeline'],
    'media.loadFail': ['Não foi possível carregar a coleção de mídias.', 'Could not load the media collection.'],
    'media.deleteConfirm': ['Esta mídia é usada em {n} clipe(s) da timeline. Remover tudo?', 'This media is used in {n} clip(s) on the timeline. Remove everything?'],
    'media.deleteFail': ['Não foi possível remover a mídia.', 'Could not remove the media.'],
    'media.clipRemoved': ['(mídia removida)', '(media removed)'],
    'upload.sending': ['Enviando {name}...', 'Uploading {name}...'],
    'upload.fail': ['Falha ao enviar "{name}": {error}', 'Failed to upload "{name}": {error}'],
    'audio.track1': ['Primeira Trilha de Áudio/Música', 'First Audio/Music Track'],
    'audio.track2': ['Segunda Trilha de Áudio/Música', 'Second Audio/Music Track'],
    'audio.ordinal1': ['primeira', 'first'],
    'audio.ordinal2': ['segunda', 'second'],
    'audio.pushed': [
      'Esse trecho da {track} trilha já tinha áudio: o clipe foi para o espaço livre mais próximo ({time}).',
      'That part of the {track} track already had audio: the clip was moved to the nearest free space ({time}).'],

    'stage.empty': ['Envie mídias e clique em <b>+</b> para montar a timeline', 'Upload media and click <b>+</b> to build the timeline'],
    'player.start': ['Voltar ao início', 'Back to start'],
    'player.startTitle': ['Início (Home)', 'Start (Home)'],
    'player.play': ['Reproduzir', 'Play'],
    'player.pause': ['Pausar', 'Pause'],
    'player.playTitle': ['Reproduzir / pausar (Espaço)', 'Play / pause (Space)'],
    'player.seek': ['Posição', 'Position'],
    'player.mediaError': ['O player não conseguiu carregar "{name}" (arquivo indisponível ou formato que o navegador não reproduz). O resto da timeline continua tocando.', 'The player could not load "{name}" (file unavailable or a format the browser cannot play). The rest of the timeline keeps playing.'],
    'player.error': ['Erro no player: {message} (detalhes no console do navegador, F12).', 'Player error: {message} (details in the browser console, F12).'],
    'player.fullscreen': ['Tela cheia', 'Fullscreen'],
    'player.fullscreenTitle': ['Tela cheia (F)', 'Fullscreen (F)'],
    'player.exitFullscreen': ['Sair da tela cheia', 'Exit fullscreen'],
    'player.exitFullscreenTitle': ['Sair da tela cheia (F ou Esc)', 'Exit fullscreen (F or Esc)'],

    'props.title': ['Propriedades do Item', 'Item Properties'],
    'props.start': ['Entrada na Timeline (s):', 'Timeline Start (s):'],
    'props.duration': ['Duração (s):', 'Duration (s):'],
    'props.track': ['Trilha:', 'Track:'],
    'props.volume': ['Volume:', 'Volume:'],
    'props.mute': ['Mudo', 'Mute'],
    'props.effect': ['Efeito Visual:', 'Visual Effect:'],
    'props.transition': ['Transição de entrada:', 'Entry transition:'],
    'props.transitionDuration': ['Duração:', 'Duration:'],
    'props.detach': ['Separar Áudio do Vídeo', 'Detach Audio from Video'],
    'props.text': ['Texto:', 'Text:'],
    'props.size': ['Tamanho:', 'Size:'],
    'props.color': ['Cor:', 'Color:'],
    'props.position': ['Posição:', 'Position:'],
    'props.none': ['Selecione um item na timeline para editar.', 'Select an item on the timeline to edit it.'],
    'fx.none': ['Nenhum', 'None'],
    'fx.grayscale': ['Preto e Branco', 'Black and White'],
    'fx.sepia': ['Sépia', 'Sepia'],
    'fx.bright': ['Brilho Aumentado', 'Increased Brightness'],
    'fx.blur': ['Desfoque', 'Blur'],
    'fx.negate': ['Negativo', 'Negative'],
    'tr.none': ['Nenhuma', 'None'],
    'tr.fade': ['Dissolver', 'Dissolve'],
    'tr.dissolve': ['Dissolver', 'Dissolve'],
    'tr.fadeblack': ['Fade pelo preto', 'Fade through black'],
    'tr.wipeleft': ['Cortina pra Esquerda', 'Wipe Left'],
    'tr.wiperight': ['Cortina pra Direita', 'Wipe Right'],
    'tr.slideleft': ['Deslizar pra Esquerda', 'Slide Left'],
    'tr.slideright': ['Deslizar pra Direita', 'Slide Right'],
    'tr.circleopen': ['Círculo', 'Circle'],
    'tr.pixelize': ['Pixelizar', 'Pixelate'],
    'color.white': ['Branco', 'White'],
    'color.yellow': ['Amarelo', 'Yellow'],
    'color.red': ['Vermelho', 'Red'],
    'color.cyan': ['Ciano', 'Cyan'],
    'color.lime': ['Verde', 'Green'],
    'color.orange': ['Laranja', 'Orange'],
    'pos.top': ['Topo', 'Top'],
    'pos.center': ['Centro', 'Center'],
    'pos.bottom': ['Rodapé', 'Bottom'],

    'timeline.title': ['Timeline', 'Timeline'],
    'timeline.split': ['Dividir', 'Split'],
    'timeline.zoom': ['Zoom', 'Zoom'],
    'timeline.zoomAria': ['Zoom da timeline', 'Timeline zoom'],
    'timeline.trackVideo': ['Vídeo / Imagem', 'Video / Image'],
    'timeline.trackAudio1': ['Áudio / Música 1', 'Audio / Music 1'],
    'timeline.trackAudio2': ['Áudio / Música 2', 'Audio / Music 2'],
    'timeline.trackText': ['Títulos / Texto', 'Titles / Text'],
    'timeline.transitionMark': ['Transição: {name} ({secs} s)', 'Transition: {name} ({secs} s)'],
    'timeline.removeClip': ['Remover clipe', 'Remove clip'],
    'split.title': ['Dividir o clipe selecionado no cursor (S)', 'Split the selected clip at the cursor (S)'],
    'split.none': ['Selecione um clipe na timeline para dividir.', 'Select a clip on the timeline to split it.'],
    'split.outside': ['Posicione o cursor sobre o clipe selecionado para dividi-lo.', 'Place the cursor over the selected clip to split it.'],
    'split.short': ['Cada parte precisa ter pelo menos {min} s.', 'Each part must be at least {min} s long.'],
    'split.transition': ['O cursor está dentro de uma transição. Mova-o um pouco para dentro do clipe.', 'The cursor is inside a transition. Move it a little further into the clip.'],
    'split.done': ['Clipe dividido em {time}.', 'Clip split at {time}.'],
    'detach.done': ['Áudio separado: agora ele é um clipe na primeira trilha de Áudio/Música.', 'Audio detached: it is now a clip on the first Audio/Music track.'],
    'detach.notVideo': ['Selecione um clipe de vídeo.', 'Select a video clip.'],
    'detach.image': ['Imagens não têm áudio.', 'Images have no audio.'],
    'detach.noAudio': ['Esse vídeo não tem faixa de áudio.', 'This video has no audio track.'],
    'detach.already': ['O áudio desse clipe já foi separado/silenciado.', 'The audio of this clip has already been detached/muted.'],
    'title.newText': ['Novo título', 'New title'],
    'paste.missing': ['A mídia desse clipe não existe mais.', 'The media of this clip no longer exists.'],

    'newProject.busy': ['Espere terminar os envios e remoções de mídia em andamento para começar um novo projeto.', 'Wait for the media uploads and removals in progress to finish before starting a new project.'],
    'newProject.confirm': ['Começar um novo projeto?\n\n{lines}\n\nIsso não pode ser desfeito.', 'Start a new project?\n\n{lines}\n\nThis cannot be undone.'],
    'newProject.discard': ['O projeto atual será descartado.', 'The current project will be discarded.'],
    'newProject.discardDirty': ['O projeto atual será descartado (há alterações não salvas).', 'The current project will be discarded (there are unsaved changes).'],
    'newProject.deleteOne': ['A mídia da coleção será apagada.', 'The media file in the collection will be deleted.'],
    'newProject.deleteMany': ['As {n} mídias da coleção serão apagadas.', 'The {n} media files in the collection will be deleted.'],
    'newProject.failOne': ['Uma mídia não pôde ser apagada da coleção. Remova-a pelo "×" do cartão.', 'One media file could not be deleted from the collection. Remove it with the "×" on its card.'],
    'newProject.failMany': ['{n} mídias não puderam ser apagadas da coleção. Remova-as pelo "×" dos cartões.', '{n} media files could not be deleted from the collection. Remove them with the "×" on their cards.'],
    'save.prompt': ['Nome do projeto:', 'Project name:'],
    'save.packing': ['Empacotando mídias ({n}/{total})...', 'Packing media ({n}/{total})...'],
    'save.skipped': ['{n} mídia(s) não puderam ser incluídas no arquivo do projeto.', '{n} media file(s) could not be included in the project file.'],
    'save.fail': ['Não foi possível salvar o projeto: {error}', 'Could not save the project: {error}'],
    'open.restoring': ['Restaurando mídia {n}/{total}: {name}', 'Restoring media {n}/{total}: {name}'],
    'open.failed': ['{n} mídia(s) do projeto não puderam ser restauradas; os clipes delas foram ignorados.', '{n} media file(s) of the project could not be restored; their clips were ignored.'],
    'open.missing': ['{n} clipe(s) foram ignorados porque a mídia não existe nesta coleção.', '{n} clip(s) were ignored because the media does not exist in this collection.'],
    'open.invalid': ['Arquivo de projeto inválido.', 'Invalid project file.'],
    'open.incomplete': ['Arquivo de projeto inválido ou incompleto.', 'Invalid or incomplete project file.'],
    'session.expired': ['As mídias expiraram no servidor por inatividade. Abra o projeto salvo para restaurá-las.', 'The media expired on the server due to inactivity. Open the saved project to restore it.'],

    'export.title': ['Exportar vídeo', 'Export video'],
    'export.close': ['Fechar', 'Close'],
    'export.resolution': ['Resolução', 'Resolution'],
    'export.fileName': ['Nome do arquivo', 'File name'],
    'export.defaultName': ['video-editado', 'edited-video'],
    'export.start': ['Exportar', 'Export'],
    'export.download': ['Baixar MP4', 'Download MP4'],
    'export.warning': ['AVISO: Exportar em resolução maior pode fazer o processo de exportação demorar mais e pode resultar em tamanho maior de arquivo em vídeo.', 'WARNING: Exporting at a higher resolution may take longer and result in a larger video file size.'],
    'export.willSave': ['Será salvo como: {file}', 'Will be saved as: {file}'],
    'export.queued': ['Na fila...', 'Queued...'],
    'export.emptyTitles': ['Os títulos estão sem texto: escreva algum texto ou adicione um clipe à timeline.', 'The titles have no text: write some text or add a clip to the timeline.'],
    'export.emptyTimeline': ['A timeline está vazia: adicione um clipe ou um título.', 'The timeline is empty: add a clip or a title.'],
    'export.startFail': ['Não foi possível iniciar a exportação (erro {status}).', 'Could not start the export (error {status}).'],
    'export.notStarted': ['O servidor não iniciou a exportação. Tente novamente.', 'The server did not start the export. Please try again.'],
    'export.lost': [
      'O servidor interrompeu a exportação (ele pode ter reiniciado por falta de memória). Tente novamente; se continuar, exporte uma timeline com menos clipes.',
      'The server interrupted the export (it may have restarted because it ran out of memory). Try again; if it keeps happening, export a timeline with fewer clips.'],
    'export.renderFail': ['Falha ao renderizar.', 'Rendering failed.'],

    'footer.language': ['Idioma:', 'Language:'],
    'footer.languageAria': ['Idioma', 'Language'],

    'srv.session': ['Sessão inválida.', 'Invalid session.'],
    'srv.file': ['Arquivo inválido.', 'Invalid file.'],
    'srv.empty': ['A timeline está vazia.', 'The timeline is empty.'],
    'srv.tooMany': ['Itens demais na timeline.', 'Too many items on the timeline.'],
    'srv.jobLost': ['O servidor não encontrou este trabalho de exportação.', 'The server could not find this export job.'],
    'srv.fontMissing': ['Fonte dos títulos não encontrada: {path}', 'Title font not found: {path}'],
    'srv.ffmpeg': ['Falha no ffmpeg: {detail}', 'ffmpeg failed: {detail}'],
    'srv.mediaGone': ['Uma mídia da timeline não existe mais na coleção. Remova o clipe ou envie o arquivo novamente.', 'A media file on the timeline no longer exists in the collection. Remove the clip or upload the file again.'],
    'srv.audioOnly': ['"{name}" é só áudio e não pode ir na trilha de vídeo.', '"{name}" is audio only and cannot go on the video track.'],
    'srv.imageOnly': ['"{name}" é uma imagem e só pode ir na trilha de vídeo.', '"{name}" is an image and can only go on the video track.'],
    'srv.noAudio': ['"{name}" não tem faixa de áudio.', '"{name}" has no audio track.'],
    'srv.nothing': ['Não há nada para exportar: adicione um clipe ou um título com texto à timeline.', 'There is nothing to export: add a clip or a title with text to the timeline.'],
    'srv.noFont': ['Nenhuma fonte .ttf configurada para os títulos (Editor:FontPath).', 'No .ttf font configured for the titles (Editor:FontPath).'],
    'srv.cancelled': ['Cancelado.', 'Cancelled.'],
    'srv.format': ['Formato não suportado.', 'Unsupported format.'],
    'srv.mediaId': ['ID de mídia inválido.', 'Invalid media ID.'],
    'srv.duplicate': ['Essa mídia já está na coleção.', 'This media is already in the collection.'],
    'srv.badImage': ['Esse arquivo não é uma imagem válida.', 'This file is not a valid image.'],
    'srv.bigImage': ['Imagem grande demais (máximo 100 megapixels).', 'Image too large (maximum 100 megapixels).'],
    'srv.ended': ['A sessão foi encerrada.', 'The session has ended.'],
    'srv.unreadable': ['Não foi possível ler esse arquivo de mídia.', 'Could not read this media file.'],
  };

  const SERVER_PATTERNS = [
    [/^Sessão inválida\.$/, 'srv.session'],
    [/^Arquivo inválido\.$/, 'srv.file'],
    [/^A timeline está vazia\.$/, 'srv.empty'],
    [/^Itens demais na timeline\.$/, 'srv.tooMany'],
    [/^O servidor não encontrou este trabalho de exportação\.$/, 'srv.jobLost'],
    [/^Fonte dos títulos não encontrada: ([\s\S]*)$/, 'srv.fontMissing', ['path']],
    [/^Falha no ffmpeg: ([\s\S]*)$/, 'srv.ffmpeg', ['detail']],
    [/^Uma mídia da timeline não existe mais na coleção\. Remova o clipe ou envie o arquivo novamente\.$/, 'srv.mediaGone'],
    [/^"([\s\S]*)" é só áudio e não pode ir na trilha de vídeo\.$/, 'srv.audioOnly', ['name']],
    [/^"([\s\S]*)" é uma imagem e só pode ir na trilha de vídeo\.$/, 'srv.imageOnly', ['name']],
    [/^"([\s\S]*)" não tem faixa de áudio\.$/, 'srv.noAudio', ['name']],
    [/^Não há nada para exportar: adicione um clipe ou um título com texto à timeline\.$/, 'srv.nothing'],
    [/^Nenhuma fonte \.ttf configurada para os títulos \(Editor:FontPath\)\.$/, 'srv.noFont'],
    [/^Cancelado\.$/, 'srv.cancelled'],
    [/^Formato não suportado\.$/, 'srv.format'],
    [/^ID de mídia inválido\.$/, 'srv.mediaId'],
    [/^Essa mídia já está na coleção\.$/, 'srv.duplicate'],
    [/^Esse arquivo não é uma imagem válida\.$/, 'srv.badImage'],
    [/^Imagem grande demais \(máximo 100 megapixels\)\.$/, 'srv.bigImage'],
    [/^A sessão foi encerrada\.$/, 'srv.ended'],
    [/^Não foi possível ler esse arquivo de mídia\.$/, 'srv.unreadable'],
  ];

  let lang = DEFAULT_LANG;
  const listeners = [];

  const isLang = (l) => typeof l === 'string' && Object.prototype.hasOwnProperty.call(LANGS, l);

  function t(key, params, forLang) {
    const entry = MESSAGES[key];
    if (!entry) return key;
    const text = entry[CODES.indexOf(isLang(forLang) ? forLang : lang)] ?? entry[0];
    return params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text;
  }

  const num = (x) => (lang === 'pt' ? String(x).replace('.', ',') : String(x));

  const isDefaultProjectName = (name) => CODES.some(c => t('project.defaultName', null, c) === name);

  function server(message) {
    const text = String(message ?? '');
    if (lang === DEFAULT_LANG) return text;
    const s = text.trim();
    for (const [re, key, names] of SERVER_PATTERNS) {
      const m = re.exec(s);
      if (!m) continue;
      const params = {};
      (names || []).forEach((n, i) => { params[n] = m[i + 1]; });
      return t(key, params);
    }
    return text;
  }

  function keyError(key, params) {
    const e = new Error(t(key, params));
    e.i18nKey = key; e.i18nParams = params;
    return e;
  }
  function serverError(text) {
    const e = new Error(server(text));
    e.serverText = String(text ?? '');
    return e;
  }
  function errorText(err) {
    if (err && err.i18nKey) return t(err.i18nKey, err.i18nParams);
    if (err && typeof err.serverText === 'string') return server(err.serverText);
    return err && err.message != null ? String(err.message) : String(err);
  }

  function apply(scope) {
    if (typeof document === 'undefined') return;
    const el = scope || document;
    el.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.getAttribute('data-i18n')); });
    el.querySelectorAll('[data-i18n-html]').forEach(n => { n.innerHTML = t(n.getAttribute('data-i18n-html')); });
    el.querySelectorAll('[data-i18n-attr]').forEach(n => {
      for (const pair of n.getAttribute('data-i18n-attr').split(';')) {
        const i = pair.indexOf(':');
        if (i > 0) n.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      }
    });
  }

  function readStored() {
    try { const v = root.localStorage && root.localStorage.getItem(STORAGE_KEY); return isLang(v) ? v : null; } catch { return null; }
  }
  function store(l) {
    try { if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, l); } catch { }
  }

  function syncDocument() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = LANGS[lang].html;
    const sel = document.getElementById('langSelect');
    if (sel && sel.value !== lang) sel.value = lang;
  }

  function setLang(next, { persist = true } = {}) {
    if (!isLang(next)) return false;
    const changed = next !== lang;
    lang = next;
    if (persist) store(lang);
    syncDocument();
    apply();
    if (changed) for (const fn of listeners.slice()) { try { fn(lang); } catch (e) { if (root.console) root.console.error(e); } }
    return changed;
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  function init() {
    syncDocument();
    apply();
    const sel = typeof document !== 'undefined' && document.getElementById('langSelect');
    if (sel) sel.addEventListener('change', () => setLang(sel.value));
  }

  const api = {
    LANGS, DEFAULT_LANG, STORAGE_KEY, MESSAGES, SERVER_PATTERNS,
    t, num, apply, server, serverError, keyError, errorText, isDefaultProjectName, setLang, onChange, init,
    get lang() { return lang; },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.EditorI18n = api;

    const stored = readStored();
    if (stored) lang = stored;

    if (typeof document !== 'undefined') {
      if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
