"use client";

import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { docToMarkdown, looksLikeMarkdown, markdownToDoc } from "@/lib/domain/rich-text";

const toolButton =
  "flex min-h-9 min-w-9 items-center justify-center rounded-button px-2 text-small transition-surface hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-light";

function Toolbar({ editor }: { editor: Editor }) {
  const on = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      heading:
        current.isActive("heading", { level: 2 }) || current.isActive("heading", { level: 1 }),
      subheading: current.isActive("heading", { level: 3 }),
      bullets: current.isActive("bulletList"),
      numbers: current.isActive("orderedList"),
      link: current.isActive("link"),
    }),
  });
  const chain = () => editor.chain().focus();
  const addLink = () => {
    const current = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt(
      "Paste the link. It needs to start with https://",
      current ?? "https://",
    );
    if (href === null) {
      return;
    }
    if (href.trim() === "" || href.trim() === "https://") {
      chain().extendMarkRange("link").unsetLink().run();
    } else if (href.trim().startsWith("https://")) {
      chain().extendMarkRange("link").setLink({ href: href.trim() }).run();
    }
  };
  const buttons: { label: string; show: React.ReactNode; pressed: boolean; run: () => void }[] = [
    { label: "Bold", show: <b>B</b>, pressed: on.bold, run: () => chain().toggleBold().run() },
    {
      label: "Italic",
      show: <i>I</i>,
      pressed: on.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      label: "Underline",
      show: <u>U</u>,
      pressed: on.underline,
      run: () => chain().toggleUnderline().run(),
    },
    {
      label: "Heading",
      show: "Heading",
      pressed: on.heading,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Subheading",
      show: "Subheading",
      pressed: on.subheading,
      run: () => chain().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Bulleted list",
      show: "List",
      pressed: on.bullets,
      run: () => chain().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      show: "1. List",
      pressed: on.numbers,
      run: () => chain().toggleOrderedList().run(),
    },
    { label: "Link", show: "Link", pressed: on.link, run: addLink },
  ];
  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap gap-0.5 border-b border-border p-1"
    >
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          aria-label={button.label}
          aria-pressed={button.pressed}
          onClick={button.run}
          className={toolButton}
        >
          {button.show}
        </button>
      ))}
    </div>
  );
}

export default function RichTextEditor({
  id,
  label,
  initial,
  describedBy,
  minHeight,
  onChange,
}: {
  id: string;
  label: string;
  initial: string;
  describedBy?: string;
  minHeight: string;
  onChange: (markdown: string) => void;
}) {
  const editorRef = useRef<Editor | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: false,
        horizontalRule: false,
        link: { openOnClick: false, protocols: ["https"], autolink: false },
      }),
    ],
    content: markdownToDoc(initial) as JSONContent,
    onUpdate: ({ editor: current }) => onChange(docToMarkdown(current.getJSON())),
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        class: `rich-text-editor ${minHeight} px-3 py-2.5 focus:outline-none`,
      },
      // Text copied with # or ** markers becomes real formatting. Anything else pastes as usual.
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!looksLikeMarkdown(text) || !editorRef.current) {
          return false;
        }
        editorRef.current.commands.insertContent(markdownToDoc(text).content as JSONContent[]);
        return true;
      },
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  if (!editor) {
    return (
      <div
        aria-hidden="true"
        className={`${minHeight} rounded-button border border-border-strong bg-surface`}
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-button border border-border-strong bg-surface focus-within:outline-2 focus-within:outline-accent-light">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
