<script>
  /* =====================================================================
     体育竞猜浮层 + 头像快捷换图
     - 体育页在首页内全屏 iframe 打开，返回按钮在体育页左上角
     - 关闭后把体育页写入 localStorage 的积分同步回博客顶栏
     ===================================================================== */
  (function () {
    'use strict';

    const sportsLayer = document.getElementById('sportsLayer');
    const sportsFrame = document.getElementById('sportsFrame');
    const openSportsBtn = document.getElementById('openSportsBtn');
    const SPORTS_SRC = 'Sports_Lottery_4.html';
    let sportsLoaded = false;

    function syncBlogPoints() {
      try {
        const value = parseInt(localStorage.getItem('user_points') || '0', 10);
        const safe = Number.isFinite(value) ? value : 0;
        document.querySelectorAll('#pointsVal, #modalUserPoints').forEach((el) => {
          el.textContent = safe;
        });
      } catch (err) {}
    }

    function tellSportsFrame(type) {
      if (!sportsFrame || !sportsFrame.contentWindow) return;
      try {
        sportsFrame.contentWindow.postMessage({ type }, '*');
      } catch (err) {}
    }

    function openSports(event) {
      if (event) event.preventDefault();
      if (!sportsLayer) return;
      sportsLayer.classList.add('active');
      sportsLayer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('sports-open');

      if (!sportsLoaded) {
        sportsLoaded = true;
        sportsFrame.src = SPORTS_SRC;
      } else {
        tellSportsFrame('sports-refresh-points');
      }

      window.setTimeout(() => {
        try { sportsFrame.focus(); } catch (err) {}
      }, 80);
    }

    function closeSports() {
      if (!sportsLayer || !sportsLayer.classList.contains('active')) return;
      sportsLayer.classList.remove('active');
      sportsLayer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('sports-open');
      syncBlogPoints();
    }

    if (openSportsBtn) openSportsBtn.addEventListener('click', openSports);
    if (sportsFrame) {
      sportsFrame.addEventListener('load', () => {
        tellSportsFrame('sports-refresh-points');
        syncBlogPoints();
      });
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'sports-close') closeSports();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sportsLayer && sportsLayer.classList.contains('active')) {
        closeSports();
      }
    });

    /* ---------- 头像：点头像直接换图，相机角标打开菜单 ---------- */
    const avatarImg = document.getElementById('userAvatar');
    const avatarCamera = document.getElementById('avatarCameraBtn');
    const avatarMenu = document.getElementById('avatarDropdownMenu');
    const avatarFile = document.getElementById('avatarFileInput');

    if (avatarImg && avatarFile) {
      avatarImg.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (avatarMenu) avatarMenu.classList.remove('active');
        avatarFile.click();
      }, true);
    }

    if (avatarCamera && avatarMenu) {
      avatarCamera.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        avatarMenu.classList.toggle('active');
      }, true);
    }
  })();
</script>
