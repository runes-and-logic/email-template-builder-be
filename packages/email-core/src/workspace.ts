import type { Template } from "./data.js";
export const blockKinds = [
  "Heading",
  "Paragraph",
  "Image",
  "Button",
  "Divider",
  "Spacer",
  "Two columns",
  "Three columns",
  "Social links",
  "Logo",
  "Footer",
  "Product",
] as const;
export type BlockKind = (typeof blockKinds)[number];
export type Block = {
  id: string;
  kind: BlockKind;
  text: string;
  url: string;
  src: string;
  alt: string;
  color: string;
  background: string;
  font: string;
  size: number;
  weight: number;
  align: "left" | "center" | "right";
  lineHeight: number;
  padding: number;
  radius: number;
  width: number;
  border: number;
  gap: number;
  columns: string[];
};
export type Document = {
  version: 2;
  id: string;
  source: string;
  name: string;
  category: string;
  modified: string;
  status: "Draft" | "Saved";
  blocks: Block[];
  background: string;
  width: number;
  subject?: string;
  preheader?: string;
};
export type BrandKit = {
  name: string;
  logo: string;
  primary: string;
  secondary: string;
  heading: string;
  body: string;
  website: string;
  socials: string;
};
export const defaultBrand: BrandKit = {
  name: "Your business",
  logo: "",
  primary: "#6e56ae",
  secondary: "#f1edf7",
  heading: "Georgia",
  body: "Arial",
  website: "https://example.com",
  socials: "",
};
export const fonts = ["Arial", "Georgia", "Verdana", "Tahoma", "Trebuchet MS"];
export function makeBlock(kind: BlockKind, brand = defaultBrand): Block {
  return {
    id: crypto.randomUUID(),
    kind,
    text:
      kind === "Heading"
        ? "Something worth opening."
        : kind === "Button"
          ? "Explore more"
          : kind === "Logo"
            ? brand.name
            : kind === "Footer"
              ? `Sent with care by ${brand.name}.`
              : kind === "Social links"
                ? brand.socials
                : kind === "Product"
                  ? "Your next favorite\nThoughtfully made. Ready for you."
                  : "A little inspiration, delivered. Add your message here.",
    url: brand.website,
    src: kind === "Logo" ? brand.logo : "",
    alt: kind === "Logo" ? brand.name : "Describe your image",
    color: kind === "Button" ? "#ffffff" : "#30283c",
    background: kind === "Button" ? brand.primary : "#ffffff",
    font: kind === "Heading" ? brand.heading : brand.body,
    size:
      kind === "Heading"
        ? 36
        : kind === "Logo"
          ? 22
          : kind === "Footer"
            ? 12
            : 16,
    weight: kind === "Heading" || kind === "Logo" ? 700 : 400,
    align: "center",
    lineHeight: 1.6,
    padding: kind === "Spacer" ? 24 : 20,
    radius: 6,
    width: 100,
    border: 0,
    gap: ["Button", "Two columns", "Three columns", "Product"].includes(kind)
      ? 16
      : 0,
    columns:
      kind === "Three columns"
        ? ["First column", "Second column", "Third column"]
        : ["First column", "Second column"],
  };
}
export function fromTemplate(
  t: Template,
  legacy?: Partial<Template> & {
    url?: string;
  },
): Document {
  const data = { ...t };
  for (const key of [
    "name",
    "brand",
    "title",
    "subtitle",
    "cta",
    "color",
  ] as const) {
    if (typeof legacy?.[key] === "string") data[key] = legacy[key];
  }
  const brand = {
    ...defaultBrand,
    name: data.brand,
    primary: data.color,
    website:
      typeof legacy?.url === "string" ? legacy.url : defaultBrand.website,
  };
  const blocks = [
    makeBlock("Logo", brand),
    makeBlock("Heading", brand),
    makeBlock("Paragraph", brand),
    makeBlock("Button", brand),
  ];
  blocks[1].text = data.title;
  blocks[2].text = data.subtitle;
  blocks[3].text = data.cta;
  if (data.image)
    blocks.push({
      ...makeBlock("Image", brand),
      src: `https://images.unsplash.com/${data.image}?auto=format&fit=crop&w=900&h=420&q=80`,
      alt:
        data.theme === "nature"
          ? "Forest landscape"
          : "A welcoming coffee shop",
      padding: 0,
    });
  blocks.push(makeBlock("Footer", brand));
  return {
    version: 2,
    id: legacy ? t.id : crypto.randomUUID(),
    source: t.id,
    name: data.name,
    category: data.category,
    modified: new Date().toISOString(),
    status: "Draft",
    blocks,
    background: "#f3f1f5",
    width: 600,
  };
}
export function validBlock(value: unknown): value is Block {
  if (!value || typeof value !== "object") return false;
  const b = value as Block;
  return (
    blockKinds.includes(b.kind) &&
    ["id", "text", "url", "src", "alt", "color", "background", "font"].every(
      (k) => typeof b[k as keyof Block] === "string",
    ) &&
    [
      "size",
      "weight",
      "lineHeight",
      "padding",
      "radius",
      "width",
      "border",
      "gap",
    ].every(
      (k) =>
        typeof b[k as keyof Block] === "number" &&
        Number.isFinite(b[k as keyof Block]),
    ) &&
    ["left", "center", "right"].includes(b.align) &&
    Array.isArray(b.columns) &&
    b.columns.length <= 3 &&
    b.columns.every((c) => typeof c === "string" && c.length <= 20000) &&
    /^[A-Za-z0-9_-]{1,100}$/.test(b.id) &&
    b.text.length <= 20000 && b.src.length <= 2000000 &&
    b.url.length <= 2048 && b.alt.length <= 500 && b.font.length <= 100 &&
    b.color.length <= 50 && b.background.length <= 50 &&
    b.size >= 8 && b.size <= 72 && b.weight >= 100 && b.weight <= 900 &&
    b.lineHeight >= 1 && b.lineHeight <= 3 && b.padding >= 0 && b.padding <= 80 &&
    b.radius >= 0 && b.radius <= 50 && b.width >= 10 && b.width <= 100 &&
    b.border >= 0 && b.border <= 10 && b.gap >= 0 && b.gap <= 64
  );
}
export function validDocument(value: unknown): value is Document {
  if (!value || typeof value !== "object") return false;
  const d = value as Document;
  return (
    d.version === 2 &&
    ["id", "source", "name", "category", "modified", "background"].every(
      (k) => typeof d[k as keyof Document] === "string",
    ) &&
    (d.status === "Draft" || d.status === "Saved") &&
    Number.isFinite(d.width) &&
    Array.isArray(d.blocks) &&
    d.blocks.length <= 300 && d.blocks.every(validBlock) &&
    new Set(d.blocks.map(b => b.id)).size === d.blocks.length &&
    /^[A-Za-z0-9_-]{1,100}$/.test(d.id) &&
    d.name.trim().length > 0 && d.name.length <= 200 && d.category.length <= 100 &&
    d.source.length <= 100 && d.background.length <= 50 &&
    !Number.isNaN(Date.parse(d.modified)) && d.width >= 320 && d.width <= 800 &&
    (d.subject === undefined || (typeof d.subject === "string" && d.subject.length <= 200)) &&
    (d.preheader === undefined || (typeof d.preheader === "string" && d.preheader.length <= 300))
  );
}
export function validBrand(value: unknown): value is BrandKit {
  if (!value || typeof value !== "object") return false;
  const brand = value as BrandKit;
  return Object.keys(defaultBrand).every(key => typeof brand[key as keyof BrandKit] === "string") &&
    brand.name.length <= 200 && brand.logo.length <= 2000000 && brand.website.length <= 2048 &&
    brand.socials.length <= 10000 && fonts.includes(brand.heading) && fonts.includes(brand.body) &&
    /^#[a-f0-9]{6}$/i.test(brand.primary) && /^#[a-f0-9]{6}$/i.test(brand.secondary);
}
