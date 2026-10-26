#!/usr/bin/perl
# 构建脚本（Perl 版）：把博客源文件 + 片段 + 终端浮层拼成一个完整 HTML。
# 逻辑与 _build.py 一一对应；这台机器没装可用的 Python，所以用 Perl 跑。
use strict;
use warnings;
use utf8;
use open ':std', ':encoding(UTF-8)';

sub readf {
    my ($path) = @_;
    open my $fh, '<:encoding(UTF-8)', $path or die "无法读取 $path: $!";
    local $/;
    my $s = <$fh>;
    close $fh;
    # Windows 换行统一成 LF，避免跨文件锚点匹配失败
    $s =~ s/\r\n/\n/g;
    return $s;
}

sub writef {
    my ($path, $data) = @_;
    open my $fh, '>:encoding(UTF-8)', $path or die "无法写入 $path: $!";
    print $fh $data;
    close $fh;
}

sub require_pos {
    my ($big, $needle, $label) = @_;
    my $p = index($big, $needle);
    die "找不到锚点：$label\n" if $p < 0;
    return $p;
}

my $blog   = readf('jacky_tina_house_1024_2.html');
my $header = readf('_shell_header.html');
my $desk   = readf('_desk_patched.html');
my $views  = readf('_tt_views.html');
my $footer = readf('_shell_footer.html');
my $style  = readf('_tt_style.css');
my $extra  = readf('_tt_extra.css');
my $appjs  = readf('_tt_app.js');
my $stocks = readf('_stocks.js');
my $skin   = readf('_blog_skin.css');
my $play   = readf('_play_section.html');
my $embed  = readf('_sports_embed.js');

# ---------- 1) 顶栏：替换右上角 ----------
my $right_start = require_pos($header, '      <div class="top-right">', '顶栏右上角起');
my $right_end   = require_pos($header, "    </div>\n  </header>", '顶栏右上角止');
my $new_right = <<'HTML';
      <div class="top-right">
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
      </div>
HTML
substr($header, $right_start, $right_end - $right_start) = $new_right;
$header =~ s/aria-label="游戏导航"/aria-label="终端导航"/;

# 返回博客按钮固定到终端左上角
my $close_left_n = ($header =~ s/(      <div class="brand">)/      <button class="tt-close tt-close-left" id="ttCloseBtn" type="button" title="返回博客" aria-label="返回博客">←<\/button>\n\n$1/);
die "未找到终端品牌锚点\n" unless $close_left_n == 1;

# ---------- 1b) 博客标题栏：去掉封面大图，改窄幅吸顶栏 ----------
my $avatar_data = q{data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Cdefs%3E%3ClinearGradient%20id='g'%20x1='0'%20y1='0'%20x2='1'%20y2='1'%3E%3Cstop%20offset='0'%20stop-color='%23f8ddb8'/%3E%3Cstop%20offset='1'%20stop-color='%23b85f2d'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width='64'%20height='64'%20rx='18'%20fill='url(%23g)'/%3E%3Cpath%20d='M15%2030.5%2032%2017l17%2013.5V48a2%202%200%200%201-2%202H17a2%202%200%200%201-2-2z'%20fill='none'%20stroke='%23fff7ec'%20stroke-width='3.2'%20stroke-linejoin='round'/%3E%3Cpath%20d='M32%2041.5c-4.4-2.8-7-4.9-7-7.9a3.9%203.9%200%200%201%207-2.3%203.9%203.9%200%200%201%207%202.3c0%203-2.6%205.1-7%207.9z'%20fill='%23fff7ec'/%3E%3C/svg%3E};
my $site_bar = <<'HTML';
  <!-- 窄幅吸顶标题栏（左侧文字置顶靠左，右侧头像 / 用户名 / 积分） -->
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
            title="点击更换头像"
            decoding="async"
          >
          <button class="avatar-camera" id="avatarCameraBtn" type="button" title="头像菜单" aria-label="打开头像菜单">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 7.5h3l1.6-2.2h6.8L17 7.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/>
              <circle cx="12" cy="12.8" r="3.1"/>
            </svg>
          </button>
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
HTML
$site_bar =~ s/__AVATAR__/$avatar_data/;

my $i_container = require_pos($blog, '  <div class="container">', '容器开始');
my $i_content   = require_pos($blog, '    <div class="content">', '内容区开始');
$blog = substr($blog, 0, $i_container) . $site_bar . substr($blog, $i_content);

# ---------- 2) 去掉原来的街机横幅（已拆成三档独立入口卡片） ----------
my $i = require_pos($blog, '      <!-- 游戏厅入口横幅 -->', '街机横幅');
my $j = require_pos(substr($blog, $i), '      </section>', '街机横幅结束') + $i + length('      </section>');
$blog = substr($blog, 0, $i) . substr($blog, $j);

# ---------- 3) 游戏厅：三档独立入口（插在 签到/日历/天气 之后、照片之前） ----------
my $anchor = '      <!-- 照片展示模块 -->';
my $anchor_pos = require_pos($blog, $anchor, '照片模块');
substr($blog, $anchor_pos, 0) = $play . "\n";

# ---------- 4) 照片模块：加宽后改为两列并排 ----------
my $photo_pos = require_pos($blog, $anchor, '照片模块（包网格）');
substr($blog, $photo_pos, 0) = '      <div class="photo-grid">' . "\n";

my $old_photo_end = "      </div>\n    </div>\n  </div>\n\n  <!-- 游戏大厅弹窗浮层 -->";
my $new_photo_end = "      </div>\n      </div><!-- /photo-grid -->\n    </div>\n  </div>\n\n  <!-- 游戏大厅弹窗浮层 -->";
my $ep = require_pos($blog, $old_photo_end, '照片模块结束');
substr($blog, $ep, length($old_photo_end)) = $new_photo_end;

# ---------- 5) 大厅内部：去掉三档 Tab 与两个占位面板 ----------
my $n = ($blog =~ s/\n      <!-- 顶部三栏分类导航 Tab -->.*?\n      <\/div>\n/\n/s);
die "未找到大厅 Tab 导航\n" unless $n == 1;
$n = ($blog =~ s/\n      <!-- 视图：行情交易终端.*?\n      <\/div>\n/\n/s);
die "未找到行情终端面板\n" unless $n == 1;
$n = ($blog =~ s/\n      <!-- 体育博彩 建设中提示 -->.*?\n      <\/div>\n/\n/s);
die "未找到体育占位面板\n" unless $n == 1;

my $renamed = ($blog =~ s/<span>🎮 游戏中心<\/span>/<span>🎮 游戏厅<\/span>/);
die "未找到游戏中心标题\n" unless $renamed == 1;

# ---------- 5b) 脚本：switchLobbyTab 不再操作已删除的节点 ----------
my $new_switch = <<'JS';
    function switchLobbyTab(tabName) {
      // 游戏厅已拆成三档独立入口，大厅里只剩经典娱乐；
      // 保留函数名与参数，避免其它旧调用点报错。
      currentLobbyTab = 'classic';
      if (gameModalContainer) gameModalContainer.classList.remove('game-playing');
      if (gameStageView) gameStageView.style.display = 'none';
      if (classicLobbyView) classicLobbyView.style.display = 'grid';
    }
JS
$n = ($blog =~ s/    function switchLobbyTab\(tabName\) \{.*?\n    \}\n/$new_switch/s);
die "未找到 switchLobbyTab\n" unless $n == 1;

# ---------- 5c) 签到区间与默认头像 ----------
$n = ($blog =~ s/const CHECKIN_MIN_POINTS = 100;/const CHECKIN_MIN_POINTS = 300;/);
die "未找到签到最低积分\n" unless $n == 1;
$n = ($blog =~ s/const CHECKIN_MAX_POINTS = 200;/const CHECKIN_MAX_POINTS = 500;/);
die "未找到签到最高积分\n" unless $n == 1;
$n = ($blog =~ s/随机 100-200 积分/随机 300-500 积分/g);
die "未找到签到提示文案（命中 $n 处）\n" unless $n >= 1;

$n = ($blog =~ s{const defaultAvatarUrl = 'https://api\.dicebear\.com/7\.x/bottts/svg\?seed=Jacky';}{const defaultAvatarUrl = "$avatar_data";});
die "未找到默认头像地址\n" unless $n == 1;

# ---------- 5d) 游戏厅关闭按钮移到左上角 ----------
my $old_close = "        <button class=\"modal-close-btn\" id=\"closeGameModalBtn\" title=\"点击关闭\">&times;</button>\n";
my $close_pos = require_pos($blog, $old_close, '游戏厅关闭按钮');
substr($blog, $close_pos, length($old_close)) = '';

my $modal_head = "      <div class=\"modal-header\">\n        <div class=\"modal-title\">";
my $modal_head_pos = require_pos($blog, $modal_head, '游戏厅标题栏');
substr($blog, $modal_head_pos, length($modal_head)) =
    "      <div class=\"modal-header\">\n"
  . "        <button class=\"modal-close-btn\" id=\"closeGameModalBtn\" type=\"button\" title=\"返回游戏厅\" aria-label=\"关闭游戏厅\">←</button>\n"
  . "        <div class=\"modal-title\">";

# ---------- 6) 组装浮层 ----------
my $overlay = "  <!-- =====================================================================\n"
            . "       行情交易终端（全屏浮层）\n"
            . "       ===================================================================== -->\n"
            . "  <div class=\"tt-app\" id=\"ttApp\" aria-hidden=\"true\">\n"
            . $header . "\n" . $desk . "\n" . $views . $footer
            . "\n  </div>\n";

my $sports_layer = "  <!-- =====================================================================\n"
                 . "       体育竞猜（当前页全屏浮层，内嵌 Sports_Lottery_4.html）\n"
                 . "       ===================================================================== -->\n"
                 . "  <div class=\"sports-layer\" id=\"sportsLayer\" aria-hidden=\"true\">\n"
                 . "    <iframe id=\"sportsFrame\" title=\"体育竞猜 · Sports Book\" loading=\"lazy\"></iframe>\n"
                 . "  </div>\n";

# ---------- 7) 样式注入 ----------
my $style_block = "\n  <style>\n" . $style . "\n" . $extra . "\n" . $skin . "\n  </style>\n";
my $head_pos = require_pos($blog, '</head>', 'head 结束');
substr($blog, $head_pos, 0) = $style_block;

# ---------- 8) 浮层 + 脚本注入 ----------
my $stock_marker = '/*__STOCKS__*/';
my $mp = require_pos($appjs, $stock_marker, '股票数据占位');
substr($appjs, $mp, length($stock_marker)) = $stocks;

my $body_pos = require_pos($blog, '</body>', 'body 结束');
substr($blog, $body_pos, 0) = $overlay . "\n" . $sports_layer . "\n" . $appjs . "\n" . $embed . "\n";

writef('jacky_tina_house_1024_8.html', $blog);
print "written ", length($blog), " chars\n";
