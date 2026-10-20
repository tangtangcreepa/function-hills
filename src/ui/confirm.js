// 破坏性操作二次确认：首击把按钮文字改为确认文案并高亮，1.6s 内再点才执行，超时复原。
// 用法：armConfirm(按钮, '确认删除?', () => { ...真正执行... })
export function armConfirm(btn, confirmText, action) {
  let armed = false;
  let timer = null;
  const original = btn.textContent;

  function disarm() {
    if (!armed) return;
    armed = false;
    btn.textContent = original;
    btn.classList.remove('armed');
    clearTimeout(timer);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // 防止冒泡到列表项/父级选中逻辑
    if (!armed) {
      armed = true;
      btn.textContent = confirmText;
      btn.classList.add('armed');
      clearTimeout(timer);
      timer = setTimeout(disarm, 1600);
      return;
    }
    disarm();
    action();
  });
}
