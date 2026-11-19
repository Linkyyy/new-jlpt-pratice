"""Check the running app with Python Playwright and Chromium.

Run `python scripts/check-passage-layout.py [http://localhost:3000]`.
"""

import shutil
import sys
from urllib.parse import urlencode

from playwright.sync_api import expect, sync_playwright


def swipe_up(touch, x, y, height):
    def move(kind, points):
        touch.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})

    move("touchStart", [{"x": x, "y": y}])
    for step in range(1, 7):
        move("touchMove", [{"x": x, "y": y - height * step / 10}])
    move("touchEnd", [])


def scroll_to_end(page, touch):
    pane = page.locator(".session-content" if touch else "html")
    article = page.locator(".reading-article").bounding_box()
    x = article["x"] + article["width"] / 2
    top = pane.bounding_box()["y"] if touch else 0
    height = page.locator(".reading-sheet").bounding_box()["y"] - top
    y = top + height * 0.8
    at_end = "e => e.scrollHeight - e.clientHeight - e.scrollTop < 2"
    for _ in range(60):
        if pane.evaluate(at_end):
            return
        if touch:
            swipe_up(touch, x, y, height)
        else:
            page.mouse.move(x, y)
            page.mouse.wheel(0, height * 2)
        page.wait_for_timeout(80)
    assert pane.evaluate(at_end), "Scrolling over the passage did not reach its end"


def assert_ending_visible(page):
    page.wait_for_function("""() => {
        const text = document.querySelector(".question-passage");
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        let last;
        while (walker.nextNode()) if (walker.currentNode.data.trim()) last = walker.currentNode;
        const end = last.data.trimEnd().length;
        const range = document.createRange();
        range.setStart(last, end - 1);
        range.setEnd(last, end);
        const glyph = range.getBoundingClientRect();
        const sheet = document.querySelector(".reading-sheet").getBoundingClientRect();
        return glyph.bottom <= sheet.top && text.contains(document.elementFromPoint(
            glyph.x + glyph.width / 2, glyph.y + glyph.height / 2));
    }""", timeout=2500)


def open_pen_setting(page, mobile):
    if mobile:
        page.locator(".answer-card-panel > .panel-trigger").click()
    page.get_by_role("button", name="练习设置", exact=True).click()
    return page.get_by_role("checkbox", name="显示长文悬浮画笔")


def check_drawer_header(sheet, handle):
    toolbar = sheet.locator(".reading-sheet-toolbar")
    nav = toolbar.locator(".reading-subquestions")
    assert "本篇" not in toolbar.inner_text()
    assert "收起题目" in handle.inner_text()

    other_number = nav.locator("button:not([aria-current])").first.inner_text()
    other = nav.get_by_text(other_number, exact=True)
    other.click()
    expect(other).to_have_attribute("aria-current", "step")
    assert other.evaluate("""button => {
        const nav = button.parentElement.getBoundingClientRect();
        const bounds = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        const outline = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        return bounds.top - outline >= nav.top && bounds.bottom + outline <= nav.bottom
            && bounds.left - outline >= nav.left && bounds.right + outline <= nav.right;
    }""")
    nav_box, handle_box = nav.bounding_box(), handle.bounding_box()
    assert nav_box["x"] + nav_box["width"] <= handle_box["x"]
    assert abs(nav_box["y"] + nav_box["height"] / 2 - handle_box["y"] - handle_box["height"] / 2) < 1


def check_clear_ink(page, touch, pen):
    toolbar = page.locator(".passage-pen-tools")
    clear = toolbar.get_by_role("button", name="清除本篇全部笔迹")
    ink = page.locator(".passage-ink g polyline")
    pen.tap()
    assert clear.is_disabled()
    assert not toolbar.inner_text().strip()
    assert toolbar.bounding_box()["width"] <= 140
    assert toolbar.locator("button svg").count() == 3

    surface = page.locator(".passage-pen-surface").bounding_box()
    top = max(surface["y"], page.locator(".session-content").bounding_box()["y"])
    bottom = min(surface["y"] + surface["height"], toolbar.bounding_box()["y"])
    for offset in (24, 60, 96):
        swipe_up(touch, surface["x"] + offset, (top + bottom) / 2, 60)
    expect(ink).to_have_count(3)
    # Give Chromium's synthetic touch sequence time to settle before tapping a control.
    page.wait_for_timeout(500)
    toolbar.get_by_role("button", name="撤销上一笔").tap()
    expect(ink).to_have_count(2)

    pen.tap()
    assert pen.get_attribute("aria-pressed") == "false"
    clear.tap()
    expect(ink).to_have_count(0)
    expect(clear).to_have_count(0)
    page.reload(wait_until="domcontentloaded")
    pen.wait_for()
    expect(ink).to_have_count(0)


def check_passage(browser, base, question_id, width, height, exam=False):
    mobile = width < 1024
    page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=mobile, has_touch=mobile)
    try:
        _, year, level, kind, _, _ = question_id.split(":")
        query = urlencode(dict(source="imported", year=year, level=level, type={"2": "grammar", "3": "reading"}[kind],
                               mode="exam" if exam else "practice", question=question_id, fresh=1))
        page.goto(f"{base}/practice?{query}", wait_until="domcontentloaded")
        if exam:
            page.get_by_role("button", name="开始考试", exact=True).click()
        pen = page.get_by_role("button", name="画笔", exact=True)
        pen.wait_for()
        on_screen = """button => {
            const r = button.getBoundingClientRect();
            return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }"""
        assert pen.evaluate(on_screen), "The pen must be visible before scrolling"
        handle = page.locator(".reading-sheet-handle")
        sheet = page.locator(".reading-sheet")
        assert sheet.evaluate("e => getComputedStyle(e).position") == "fixed"
        assert pen.evaluate("b => getComputedStyle(b.parentElement).position") == "fixed"
        article = page.locator(".reading-article")
        article_size = article.evaluate("e => [e.offsetWidth, e.offsetHeight]")
        handle.click()
        assert handle.get_attribute("aria-expanded") == "true"
        check_drawer_header(sheet, handle)
        opened = sheet.bounding_box()
        assert opened["height"] <= 180, "The default drawer is too tall"
        touch = page.context.new_cdp_session(page) if mobile else None
        scroll_to_end(page, touch)
        assert_ending_visible(page)

        grip = handle.locator(".reading-grip").bounding_box()
        x, y = grip["x"] + grip["width"] / 2, grip["y"] + grip["height"] / 2
        if touch:
            swipe_up(touch, x, y, height)
        else:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x, 12, steps=12)
            page.mouse.up()
        raised = sheet.bounding_box()
        assert raised["height"] > opened["height"]
        assert abs((raised["y"] + raised["height"]) - (opened["y"] + opened["height"])) < 1
        assert_ending_visible(page)  # Raising the drawer must keep an already visible ending in view.
        scroll_to_end(page, touch)
        assert_ending_visible(page)
        assert pen.evaluate(on_screen)
        assert pen.bounding_box()["y"] + pen.bounding_box()["height"] <= raised["y"]
        assert article.evaluate("e => [e.offsetWidth, e.offsetHeight]") == article_size

        if mobile and not exam:
            option = sheet.locator(".answer-option").first
            option.evaluate("e => e.scrollIntoView({ block: 'center' })")
            pane_box = sheet.locator(".reading-sheet-content").bounding_box()
            option_box = option.bounding_box()
            assert option_box["y"] >= pane_box["y"]
            assert option_box["y"] + option_box["height"] <= pane_box["y"] + pane_box["height"]
            check_clear_ink(page, touch, pen)

        if not exam:
            pen.click()
            option = open_pen_setting(page, mobile)
            assert option.is_checked()
            option.uncheck()
            assert not page.locator(".passage-pen-tools, [data-drawing]").count()
            assert article.evaluate("e => [e.offsetWidth, e.offsetHeight]") == article_size
            page.reload(wait_until="domcontentloaded")
            article.wait_for()
            assert not pen.count()
            option = open_pen_setting(page, mobile)
            assert not option.is_checked()
            option.check()
            assert page.locator(".passage-pen-tools button[aria-pressed='false']").count() == 1
    finally:
        page.close()


if __name__ == "__main__":
    base_url = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
    reading = "imported:201507:N1:3:5346:56"
    grammar = "imported:201607:N1:2:5119:43"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which("chromium"))
        check_passage(browser, base_url, reading, 390, 844)
        check_passage(browser, base_url, grammar, 844, 390, exam=True)
        check_passage(browser, base_url, grammar, 1280, 800)
        browser.close()
