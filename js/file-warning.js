// ES Modules は file:// では読み込めないため、直接開かれた場合に案内を出す（通常の script として読み込む）
if (location.protocol === 'file:') {
  document.addEventListener('DOMContentLoaded', function () {
    var note = document.createElement('p');
    note.className = 'file-warning';
    note.textContent = 'index.html を直接開くと地図や抽選が動きません。フォルダで「python -m http.server 5173」を実行し、http://localhost:5173 を開いてください（公開版は Vercel の URL で表示されます）。';
    document.body.prepend(note);
  });
}
