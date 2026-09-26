import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { requireAuth, requirePermission, AuthError } from "@/lib/auth";
import crypto from "crypto";

export async function GET() {
  await initDb();
  const res = await db.execute(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id
    GROUP BY c.id
    ORDER BY c.name ASC
  `);

  return NextResponse.json({ categories: res.rows });
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "categories.manage");

    const body = await req.json().catch(() => ({}));
    const { name, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    const existing = await db.execute({
      sql: "SELECT id FROM categories WHERE LOWER(name) = LOWER(?)",
      args: [name.trim()],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await db.execute({
      sql: "INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)",
      args: [id, name.trim(), description ? description.trim() : "", now],
    });

    return NextResponse.json({
      success: true,
      category: { id, name: name.trim(), description, created_at: now },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "categories.manage");

    const body = await req.json().catch(() => ({}));
    const { id, name, description } = body;

    if (!id || !name || !name.trim()) {
      return NextResponse.json({ error: "Category ID and name are required" }, { status: 400 });
    }

    const existing = await db.execute({
      sql: "SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?",
      args: [name.trim(), id],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Another category with this name already exists" }, { status: 409 });
    }

    await db.execute({
      sql: "UPDATE categories SET name = ?, description = ? WHERE id = ?",
      args: [name.trim(), description ? description.trim() : "", id],
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
