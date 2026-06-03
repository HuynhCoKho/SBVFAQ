# Apps Script setup

Copy **only** the contents of [`Code.gs`](Code.gs) into the Google Apps Script editor.

The first line in Apps Script must be:

```js
/**
```

If your editor starts with a line like one of these, delete everything and paste the file again:

```text
(cd "$(git rev-parse --show-toplevel)" && git apply -3way <<'EOF'
diff --git a/apps-script/Code.gs b/apps-script/Code.gs
+++ b/apps-script/Code.gs
@@ ...
```

Those lines are git patch instructions, not Apps Script code, and they cause:

```text
SyntaxError: Unexpected string line: 1 file: Code.gs
```

After pasting the correct file, save the project. The Apps Script function dropdown should show `doGet` and other functions instead of `No functions`.
