import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

export function mountKernelEditor(parent, source, { onEdit, onRun }) {
  const extensions = [
    keymap.of([
      {
        key: "Mod-Enter",
        run() {
          onRun();
          return true;
        },
      },
      indentWithTab,
    ]),
    EditorView.domEventObservers({
      keydown(event, view) {
        // Let Tab leave the editor even when Escape closes an editor panel or selection.
        if (event.key === "Escape") view.setTabFocusMode(2000);
      },
    }),
    basicSetup,
    python(),
    oneDark,
    indentUnit.of("    "),
    EditorState.tabSize.of(4),
    EditorView.contentAttributes.of({
      "aria-label": "Python kernel source",
      "aria-describedby": "editor-shortcuts",
    }),
    EditorView.updateListener.of(({ docChanged }) => {
      if (docChanged) onEdit();
    }),
  ];
  const createState = (doc) => EditorState.create({ doc, extensions });
  const view = new EditorView({ parent, state: createState(source) });

  return {
    get source() {
      return view.state.doc.toString();
    },
    reveal(source) {
      const index = view.state.doc.toString().indexOf(source);
      if (index === -1) return false;
      view.dispatch({
        selection: { anchor: index, head: index + source.length },
        scrollIntoView: true,
      });
      view.focus();
      return true;
    },
    reset(source) {
      view.setState(createState(source));
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
