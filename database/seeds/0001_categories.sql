INSERT INTO categories (id, slug, name, name_my, display_order)
VALUES
  ('category-world', 'world', 'World', 'ကမ္ဘာ', 10),
  ('category-technology', 'technology', 'Technology', 'နည်းပညာ', 20),
  ('category-business', 'business', 'Business', 'စီးပွားရေး', 30),
  ('category-science', 'science', 'Science', 'သိပ္ပံ', 40)
ON CONFLICT (slug) DO UPDATE SET
  name = excluded.name,
  name_my = excluded.name_my,
  display_order = excluded.display_order,
  is_active = 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
