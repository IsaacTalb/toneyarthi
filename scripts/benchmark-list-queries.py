#!/usr/bin/env python3
"""Repeatable, dependency-free proxy benchmark for the D1 list indexes."""

import sqlite3
import statistics
import time

ROWS = 50_000
QUERIES = {
    "public audio": ("SELECT id FROM articles WHERE status='published' AND published_at<=datetime('now') AND audio_url IS NOT NULL ORDER BY published_at DESC,id DESC LIMIT 20", ()),
    "category feed": ("SELECT id FROM articles WHERE category_id=? AND status='published' AND published_at<=datetime('now') ORDER BY published_at DESC,id DESC LIMIT 20", ("world",)),
    "admin jobs": ("SELECT id FROM processing_jobs ORDER BY created_at DESC LIMIT 50 OFFSET 5000", ()),
}


def database(after: bool) -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.executescript("""
      CREATE TABLE articles(id TEXT PRIMARY KEY,category_id TEXT,status TEXT,published_at TEXT,audio_url TEXT);
      CREATE INDEX idx_articles_publication ON articles(status,published_at DESC,id);
      CREATE INDEX idx_articles_category_feed ON articles(category_id,status,published_at DESC);
      CREATE TABLE processing_jobs(id TEXT PRIMARY KEY,created_at TEXT);
      CREATE TABLE playlists(id TEXT PRIMARY KEY,status TEXT,published_at TEXT,updated_at TEXT);
    """)
    articles = [(f"a{i:06}", "world" if i % 3 else "local", "published", f"2026-08-{1 + i % 28:02}T{i % 24:02}:00:00Z", "audio.wav" if i % 2 else None) for i in range(ROWS)]
    db.executemany("INSERT INTO articles VALUES(?,?,?,?,?)", articles)
    db.executemany("INSERT INTO processing_jobs VALUES(?,?)", [(f"j{i:06}", f"2026-08-{1 + i % 28:02}T{i % 24:02}:00:00Z") for i in range(ROWS)])
    if after:
        db.executescript(open("database/migrations/0028_add_list_query_indexes.sql", encoding="utf-8").read())
    db.execute("ANALYZE")
    return db


def measure(db: sqlite3.Connection, sql: str, bindings: tuple) -> tuple[float, str]:
    for _ in range(5):
        db.execute(sql, bindings).fetchall()
    samples = []
    for _ in range(30):
        start = time.perf_counter()
        db.execute(sql, bindings).fetchall()
        samples.append((time.perf_counter() - start) * 1000)
    plan = "; ".join(row[3] for row in db.execute("EXPLAIN QUERY PLAN " + sql, bindings))
    return statistics.median(samples), plan


if __name__ == "__main__":
    before, after = database(False), database(True)
    print(f"rows={ROWS}; median of 30 warm runs (ms)")
    for name, (sql, bindings) in QUERIES.items():
        old, old_plan = measure(before, sql, bindings)
        new, new_plan = measure(after, sql, bindings)
        print(f"{name}: {old:.3f} -> {new:.3f} ({(old-new)/old*100:.1f}%); before=[{old_plan}]; after=[{new_plan}]")
