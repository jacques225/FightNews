export type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  sport: string;
  tags: string[];
  image_url: string | null;
  source_name: string;
  source_url: string;
  source_official?: boolean; // fédération ou organisation officielle
  published_at: string;
  status: "draft" | "published" | "rejected";
};
