import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TextStyleKit } from "@tiptap/extension-text-style";
import type { Extensions } from "@tiptap/core";
import { BlockLineHeight } from "@/lib/tiptap/block-line-height";

export function createStorefrontEditorExtensions(
  placeholder: string,
): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      link: false,
    }),
    TextStyleKit.configure({
      backgroundColor: false,
      lineHeight: false,
    }),
    BlockLineHeight,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
    }),
    Placeholder.configure({ placeholder }),
  ];
}
