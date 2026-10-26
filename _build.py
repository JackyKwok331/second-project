import io, re

blog = io.open('jacky_tina_house_1024_2.html', encoding='utf-8').read()
header = io.open('_shell_header.html', encoding='utf-8').read()
desk = io.open('_desk_patched.html', encoding='utf-8').read()
views = io.open('_tt_views.html', encoding='utf-8').read()
footer = io.open('_shell_footer.html', encoding='utf-8').read()
style = io.open('_tt_style.css', encoding='utf-8').read()
extra = io.open('_tt_extra.css', encoding='utf-8').read()
appjs = io.open('_tt_app.js', encoding='utf-8').read()
stocks = io.open('_stocks.js', encoding='utf-8').read()
skin = io.open('_blog_skin.css', encoding='utf-8').read()

# ---------- 1) 顶栏：替换右上角 ----------
old_right = header[header.index('      <div class="top-right">'):header.index('    </div>\n  </header>')]
new_right = '''      <div class="top-right">
        <span class="prototype-pill">模拟盘 · T+1</span>
        <div class="market-chip">
          <span class="live-dot"></span>
          <b>沪深 交易中</b>
          <span id="ttClock">10/23 · 14:32</span>
        </div>
        <div class="wallet" id="ttWalletBtn" title="点击打开积分账户">
          <span class="wallet-coin">分</span>
          <div><small>可用积分</small><b id="ttWalletVal">0.0</b></div>
        </div>
        <button class="tt-close" id="ttCloseBtn" type="button" title="返回博客" aria-label="返回博客">✕</button>
      </div>
'''
header = header.replace(old_right, new_right, 1)
header = header.replace('aria-label="游戏导航"', 'aria-label="终端导航"')

# ---------- 1b) 博客标题栏：去掉封面大图，改窄幅吸顶栏 ----------
avatar_data = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Cdefs%3E%3ClinearGradient%20id='g'%20x1='0'%20y1='0'%20x2='1'%20y2='1'%3E%3Cstop%20offset='0'%20stop-color='%23f8ddb8'/%3E%3Cstop%20offset='1'%20stop-color='%23b85f2d'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width='64'%20height='64'%20rx='18'%20fill='url(%23g)'/%3E%3Cpath%20d='M15%2030.5%2032%2017l17%2013.5V48a2%202%200%200%201-2%202H17a2%202%200%200%201-2-2z'%20fill='none'%20stroke='%23fff7ec'%20stroke-width='3.2'%20stroke-linejoin='round'/%3E%3Cpath%20d='M32%2041.5c-4.4-2.8-7-4.9-7-7.9a3.9%203.9%200%200%201%207-2.3%203.9%203.9%200%200%201%207%202.3c0%203-2.6%205.1-7%207.9z'%20fill='%23fff7ec'/%3E%3C/svg%3E"
site_bar = '''  <!-- 窄幅吸顶标题栏（左侧文字置顶靠左，右侧头像 / 用户名 / 积分） -->
  <header class="site-bar" id="siteBar">
    <div class="site-bar-inner">
      <a class="site-brand" href="#top">
        <span class="site-brand-mark" aria-hidden="true">J&amp;T</span>
        <span class="site-brand-text">
          <span class="site-brand-name">Jacky &amp; Tina House</span>
          <span class="site-brand-sub">记录生活中的美好瞬间与日常灵感</span>
        </span>
      </a>

      <div class="user-points-badge">
        <div class="avatar-dropdown-wrapper" id="avatarDropdownWrapper">
          <img
            src="__AVATAR__"
            alt="头像"
            class="user-avatar"
            id="userAvatar"
            title="点击展开头像菜单"
            decoding="async"
          >
          <div class="avatar-dropdown-menu" id="avatarDropdownMenu">
            <div class="dropdown-item" id="changeAvatarBtn">
              <span class="dropdown-icon">📷</span> 修改头像
            </div>
            <div class="dropdown-item dropdown-item-danger" id="resetAvatarBtn">
              <span class="dropdown-icon">🔄</span> 恢复默认
            </div>
          </div>
        </div>

        <input type="file" id="avatarFileInput" accept="image/*" style="display: none;">

        <div class="user-meta">
          <span class="user-name">Jacky</span>
          <div class="points-box" id="pointsBox" title="点击管理积分（管理员测试）">
            <span class="points-icon">🪙</span>
            <span class="points-num" id="pointsVal">0</span>
            <span class="points-unit">分</span>
          </div>
        </div>
      </div>
    </div>
  </header>

  <div class="container">
'''
site_bar = site_bar.replace('__AVATAR__', avatar_data)

i_container = blog.index('  <div class="container">')
i_content = blog.index('    <div class="content">', i_container)
blog = blog[:i_container] + site_bar + blog[i_content:]

# ---------- 2) 去掉原来的街机横幅（已拆成三档独立入口卡片） ----------
i = blog.index('      <!-- 游戏厅入口横幅 -->')
j = blog.index('      </section>', i) + len('      </section>')
blog = blog[:i] + blog[j:]

# ---------- 3) 游戏厅：三档独立入口（插在 签到/日历/天气 之后、照片之前） ----------
play_section = '''
      <!-- 游戏厅：三档独立入口（经典娱乐 / 行情交易 / 体育竞猜） -->
      <section class="play-section" aria-labelledby="playTitle">
        <div class="play-head">
          <div class="play-head-text">
            <h2 class="play-title" id="playTitle">🎮 游戏厅</h2>
            <p class="play-sub">三档玩法各自独立 · 全部使用博客积分，纯虚拟不涉及真钱</p>
          </div>
          <span class="play-note">积分与顶部账户互通</span>
        </div>

        <div class="play-grid">
          <!-- 档 1：经典娱乐 -->
          <article class="play-card play-card-arcade">
            <span class="play-watermark" aria-hidden="true">🎡</span>
            <div class="play-card-head">
              <span class="play-icon">🎪</span>
              <span class="play-tag">8 款小游戏</span>
            </div>
            <h3 class="play-name">游戏厅</h3>
            <p class="play-desc">大转盘、摇骰子、刮刮乐、水果机、数字轮盘、梭哈、成语抢答、21 点。</p>
            <ul class="play-points">
              <li>单次 2 ~ 10 积分</li>
              <li>即点即玩</li>
            </ul>
            <button class="play-cta" id="openGameModalBtn" type="button" aria-haspopup="dialog" aria-controls="gameModal">
              投币开玩 <span class="play-cta-arrow" aria-hidden="true">→</span>
            </button>
          </article>

          <!-- 档 2：行情交易终端 -->
          <article class="play-card play-card-terminal">
            <span class="play-watermark" aria-hidden="true">📈</span>
            <div class="play-card-head">
              <span class="play-icon">📈</span>
              <span class="play-tag">T+1 · 0.03% 手续费</span>
            </div>
            <h3 class="play-name">行情交易终端</h3>
            <p class="play-desc">用博客积分做虚拟交易：A 股、ETF、美股与指数，2 分钟一档行情。</p>
            <ul class="play-points">
              <li>首次赠送 20,000 积分</li>
              <li>积分 1:1 转入 / 提现</li>
            </ul>
            <button class="play-cta" id="openTerminalBtn" type="button">
              进入终端 <span class="play-cta-arrow" aria-hidden="true">→</span>
            </button>
          </article>

          <!-- 档 3：体育竞猜（独立页面 Sports_Lottery_2.html） -->
          <article class="play-card play-card-sports">
            <span class="play-watermark" aria-hidden="true">⚽</span>
            <div class="play-card-head">
              <span class="play-icon">⚽</span>
              <span class="play-tag">赛前 48 小时 · 2 小时一刷</span>
            </div>
            <h3 class="play-name">体育竞猜</h3>
            <p class="play-desc">足球、篮球、网球、电竞。单关、2串1、3串1，赔率每 2 小时刷新一次。</p>
            <ul class="play-points">
              <li>单关 10 ~ 200 积分</li>
              <li>串关单票 10 ~ 100 积分</li>
            </ul>
            <a class="play-cta" href="Sports_Lottery_2.html" target="_blank" rel="noopener">
              查看竞猜台 <span class="play-cta-arrow" aria-hidden="true">↗</span>
            </a>
          </article>
        </div>
      </section>
'''

anchor = '      <!-- 照片展示模块 -->'
assert anchor in blog
blog = blog.replace(anchor, play_section.lstrip('\n') + '\n' + anchor, 1)

# ---------- 4) 照片模块：加宽后改为两列并排 ----------
blog = blog.replace(anchor, '      <div class="photo-grid">\n' + anchor, 1)

old_photo_end = '      </div>\n    </div>\n  </div>\n\n  <!-- 游戏大厅弹窗浮层 -->'
assert old_photo_end in blog
blog = blog.replace(old_photo_end, '      </div>\n      </div><!-- /photo-grid -->\n    </div>\n  </div>\n\n  <!-- 游戏大厅弹窗浮层 -->', 1)

# ---------- 5) 大厅内部：去掉三档 Tab 与两个占位面板 ----------
blog, n = re.subn(r'\n      <!-- 顶部三栏分类导航 Tab -->.*?\n      </div>\n', '\n', blog, count=1, flags=re.S)
assert n == 1, 'tab nav not found'
blog, n = re.subn(r'\n      <!-- 视图：行情交易终端.*?\n      </div>\n', '\n', blog, count=1, flags=re.S)
assert n == 1, 'stock panel not found'
blog, n = re.subn(r'\n      <!-- 体育博彩 建设中提示 -->.*?\n      </div>\n', '\n', blog, count=1, flags=re.S)
assert n == 1, 'sports panel not found'

blog = blog.replace('<span>🎮 游戏中心</span>', '<span>🎮 游戏厅</span>', 1)

# ---------- 5b) 脚本：switchLobbyTab 不再操作已删除的节点 ----------
new_switch = '''    function switchLobbyTab(tabName) {
      // 游戏厅已拆成三档独立入口，大厅里只剩经典娱乐；
      // 保留函数名与参数，避免其它旧调用点报错。
      currentLobbyTab = 'classic';
      if (gameModalContainer) gameModalContainer.classList.remove('game-playing');
      if (gameStageView) gameStageView.style.display = 'none';
      if (classicLobbyView) classicLobbyView.style.display = 'grid';
    }
'''
pat = re.compile(r'    function switchLobbyTab\(tabName\) \{.*?\n    \}\n', re.S)
blog, n = pat.subn(new_switch, blog, count=1)
assert n == 1, 'switchLobbyTab not found'

# ---------- 5c) 签到区间与默认头像 ----------
blog, n = re.subn(r'const CHECKIN_MIN_POINTS = 100;', 'const CHECKIN_MIN_POINTS = 300;', blog, count=1)
assert n == 1, 'checkin min not found'
blog, n = re.subn(r'const CHECKIN_MAX_POINTS = 200;', 'const CHECKIN_MAX_POINTS = 500;', blog, count=1)
assert n == 1, 'checkin max not found'
blog, n = re.subn(r'随机 100-200 积分', '随机 300-500 积分', blog)
assert n >= 1, 'checkin hint not found'
blog, n = re.subn(
    r"const defaultAvatarUrl = 'https://api\.dicebear\.com/7\.x/bottts/svg\?seed=Jacky';",
    'const defaultAvatarUrl = "' + avatar_data + '";',
    blog,
    count=1,
)
assert n == 1, 'default avatar not found'

# ---------- 6) 组装浮层 ----------
overlay = '''  <!-- =====================================================================
       行情交易终端（全屏浮层）
       ===================================================================== -->
  <div class="tt-app" id="ttApp" aria-hidden="true">
''' + header + '\n' + desk + '\n' + views + footer + '''
  </div>
'''

# ---------- 7) 样式注入 ----------
style_block = '\n  <style>\n' + style + '\n' + extra + '\n' + skin + '\n  </style>\n'
blog = blog.replace('</head>', style_block + '</head>', 1)

# ---------- 8) 浮层 + 脚本注入 ----------
appjs = appjs.replace('/*__STOCKS__*/', stocks)
blog = blog.replace('</body>', overlay + '\n' + appjs + '\n</body>', 1)

io.open('jacky_tina_house_1024_6.html', 'w', encoding='utf-8').write(blog)
print('written', len(blog))
