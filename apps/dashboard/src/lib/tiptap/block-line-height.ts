import { Extension, getStyleProperty } from "@tiptap/core";

const BLOCK_TYPES = ["paragraph", "heading"] as const;

function updateBlockLineHeight({
  tr,
  state,
  dispatch,
  lineHeight,
}: {
  tr: import("@tiptap/pm/state").Transaction;
  state: import("@tiptap/pm/state").EditorState;
  dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void;
  lineHeight: string | null;
}) {
  const { from, to } = state.selection;
  let modified = false;

  const apply = (pos: number, node: import("@tiptap/pm/model").Node) => {
    if (!BLOCK_TYPES.includes(node.type.name as (typeof BLOCK_TYPES)[number])) {
      return;
    }
    if (node.attrs.lineHeight === lineHeight) {
      return;
    }
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight });
    modified = true;
  };

  state.doc.nodesBetween(from, to, (node, pos) => {
    apply(pos, node);
  });

  if (!modified) {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (BLOCK_TYPES.includes(node.type.name as (typeof BLOCK_TYPES)[number])) {
        apply($from.before(depth), node);
        break;
      }
    }
  }

  if (modified && dispatch) {
    dispatch(tr);
  }

  return modified;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

/**
 * Applies line-height on paragraph/heading nodes (block level).
 * TipTap's bundled LineHeight extension uses textStyle marks on spans, which
 * does not affect paragraph line spacing in practice.
 */
export const BlockLineHeight = Extension.create({
  name: "blockLineHeight",

  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_TYPES],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => {
              const value =
                getStyleProperty(element, "line-height") ??
                element.style.lineHeight;
              return value || null;
            },
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) {
                return {};
              }
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ tr, state, dispatch }) =>
          updateBlockLineHeight({ tr, state, dispatch, lineHeight }),

      unsetLineHeight:
        () =>
        ({ tr, state, dispatch }) =>
          updateBlockLineHeight({ tr, state, dispatch, lineHeight: null }),
    };
  },
});

export function getBlockLineHeight(editor: import("@tiptap/core").Editor): string {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (BLOCK_TYPES.includes(node.type.name as (typeof BLOCK_TYPES)[number])) {
      const value = node.attrs.lineHeight;
      if (typeof value === "string" && value) {
        return value;
      }
    }
  }

  const markAttrs = editor.getAttributes("textStyle");
  return typeof markAttrs.lineHeight === "string" ? markAttrs.lineHeight : "";
}
