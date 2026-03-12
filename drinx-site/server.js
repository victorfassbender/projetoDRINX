const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const DB_FILE =
  process.env.DRINX_DB_FILE || path.join(__dirname, "data", "orders.db");
const ORDERS_LIMIT = 250;
const STORE_PRODUCTS_LIMIT = 1200;
const ADMIN_USER = String(process.env.DRINX_ADMIN_USER || "luan").trim();
const ADMIN_PASSWORD = String(process.env.DRINX_ADMIN_PASSWORD || "123456789").trim();
const ADMIN_SESSION_COOKIE = "drinx_admin_session";
const ADMIN_SESSION_TTL_MS = Math.max(
  60 * 1000,
  Number(process.env.DRINX_ADMIN_SESSION_TTL_MS || 15 * 60 * 1000)
);

const adminSessions = new Map();

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new sqlite3.Database(DB_FILE);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row || null);
    });
  });

const normalizeOrderRecord = (record) => {
  const product = String(record?.product || "").trim();
  const note = String(record?.note || "").trim();
  const quantity = Math.max(0, Math.floor(Number(record?.quantity || 0)));
  const unitPrice = Math.max(0, Number(record?.unitPrice || 0));
  const hasPrice = Boolean(record?.hasPrice) && unitPrice > 0;
  const key = String(record?.key || "").trim();
  const updatedAt = Number(record?.updatedAt) || Date.now();

  if (!product || !key || quantity <= 0) {
    return null;
  }

  return {
    key,
    product,
    note,
    quantity,
    unitPrice,
    hasPrice,
    updatedAt,
  };
};

const serializeOrder = (row) => ({
  key: row.order_key,
  product: row.product,
  note: row.note || "",
  quantity: Number(row.quantity || 0),
  unitPrice: Number(row.unit_price || 0),
  hasPrice: Boolean(row.has_price),
  updatedAt: Number(row.updated_at || 0),
});

const parseDecimal = (value, fallback = 0) => {
  let normalized = value;

  if (typeof value === "string") {
    const text = value.trim();

    if (text.includes(",") && text.includes(".")) {
      normalized = text.replace(/\./g, "").replace(",", ".");
    } else if (text.includes(",")) {
      normalized = text.replace(",", ".");
    } else {
      normalized = text;
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseStock = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }

  return Math.max(0, Math.floor(parsed));
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "sim", "yes"].includes(normalized)) return true;
    if (["0", "false", "nao", "não", "no"].includes(normalized)) return false;
  }

  return Boolean(fallback);
};

const normalizeProductPayload = (payload = {}, fallback = {}) => {
  const merged = {
    ...fallback,
    ...payload,
  };

  const name = String(merged.name || "").trim();
  if (!name) {
    return { error: "Nome do produto é obrigatório" };
  }

  const categoryRaw = merged.category ?? merged.categoryName ?? fallback.category ?? "Geral";
  const category = String(categoryRaw || "Geral").trim() || "Geral";

  const description = String(merged.description || "").trim();
  const imageUrl = String(merged.imageUrl ?? merged.image_url ?? "").trim();
  const price = Math.max(0, parseDecimal(merged.price, fallback.price ?? 0));
  const stock = parseStock(merged.stock, fallback.stock ?? 0);
  const isCombo = parseBoolean(merged.isCombo ?? merged.is_combo, fallback.isCombo ?? false);
  const visible = parseBoolean(merged.visible, fallback.visible ?? true);

  return {
    name,
    category,
    description,
    imageUrl,
    price,
    stock,
    isCombo,
    visible,
  };
};

const serializeAdminProduct = (row) => ({
  id: Number(row.id),
  name: row.name,
  category: row.category,
  description: row.description || "",
  imageUrl: row.image_url || "",
  price: Number(row.price || 0),
  stock: Number(row.stock || 0),
  isCombo: Boolean(row.is_combo),
  visible: Boolean(row.visible),
  updatedAt: Number(row.updated_at || 0),
});

const serializeStoreProduct = (row) => ({
  id: Number(row.id),
  name: row.name,
  categoryName: row.category,
  description: row.description || "",
  imageUrl: row.image_url || "",
  price: Number(row.price || 0),
  stock: Number(row.stock || 0),
  isCombo: Boolean(row.is_combo),
});

const getProductRowById = async (id) =>
  get(
    `
      SELECT
        id,
        name,
        category,
        description,
        image_url,
        price,
        stock,
        is_combo,
        visible,
        updated_at
      FROM products
      WHERE id = ?
    `,
    [id]
  );

const listAdminProducts = async () =>
  all(
    `
      SELECT
        id,
        name,
        category,
        description,
        image_url,
        price,
        stock,
        is_combo,
        visible,
        updated_at
      FROM products
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `,
    [STORE_PRODUCTS_LIMIT]
  );

const listStoreProducts = async () =>
  all(
    `
      SELECT
        id,
        name,
        category,
        description,
        image_url,
        price,
        stock,
        is_combo,
        visible,
        updated_at
      FROM products
      WHERE visible = 1 AND stock > 0
      ORDER BY is_combo DESC, category COLLATE NOCASE ASC, name COLLATE NOCASE ASC
      LIMIT ?
    `,
    [STORE_PRODUCTS_LIMIT]
  );

const upsertProduct = async (payload, existingRow = null) => {
  const fallback = existingRow
    ? {
        name: existingRow.name,
        category: existingRow.category,
        description: existingRow.description || "",
        imageUrl: existingRow.image_url || "",
        price: Number(existingRow.price || 0),
        stock: Number(existingRow.stock || 0),
        isCombo: Boolean(existingRow.is_combo),
        visible: Boolean(existingRow.visible),
      }
    : {};

  const normalized = normalizeProductPayload(payload, fallback);
  if (normalized.error) {
    return { error: normalized.error };
  }

  const now = Date.now();

  if (!existingRow) {
    const result = await run(
      `
        INSERT INTO products (
          name,
          category,
          description,
          image_url,
          price,
          stock,
          is_combo,
          visible,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        normalized.name,
        normalized.category,
        normalized.description,
        normalized.imageUrl,
        normalized.price,
        normalized.stock,
        normalized.isCombo ? 1 : 0,
        normalized.visible ? 1 : 0,
        now,
      ]
    );

    const inserted = await getProductRowById(result.lastID);
    return { data: inserted ? serializeAdminProduct(inserted) : null };
  }

  await run(
    `
      UPDATE products
      SET
        name = ?,
        category = ?,
        description = ?,
        image_url = ?,
        price = ?,
        stock = ?,
        is_combo = ?,
        visible = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      normalized.name,
      normalized.category,
      normalized.description,
      normalized.imageUrl,
      normalized.price,
      normalized.stock,
      normalized.isCombo ? 1 : 0,
      normalized.visible ? 1 : 0,
      now,
      existingRow.id,
    ]
  );

  const updated = await getProductRowById(existingRow.id);
  return { data: updated ? serializeAdminProduct(updated) : null };
};

const initializeDatabase = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      order_key TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      note TEXT,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      has_price INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(
    "CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at DESC)"
  );

  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      is_combo INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(
    "CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at DESC)"
  );

  await run(
    "CREATE INDEX IF NOT EXISTS idx_products_store_view ON products(visible, stock, is_combo)"
  );
};

const replaceOrders = async (orders) => {
  await run("BEGIN IMMEDIATE TRANSACTION");

  try {
    await run("DELETE FROM orders");

    for (const order of orders) {
      await run(
        `
          INSERT INTO orders (
            order_key,
            product,
            note,
            quantity,
            unit_price,
            has_price,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          order.key,
          order.product,
          order.note,
          order.quantity,
          order.unitPrice,
          order.hasPrice ? 1 : 0,
          order.updatedAt,
        ]
      );
    }

    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
};

const safeCompare = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const parseCookies = (cookieHeader = "") => {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const separatorIndex = item.indexOf("=");
      if (separatorIndex <= 0) {
        return acc;
      }

      const name = item.slice(0, separatorIndex).trim();
      const rawValue = item.slice(separatorIndex + 1).trim();

      try {
        acc[name] = decodeURIComponent(rawValue);
      } catch (_error) {
        acc[name] = rawValue;
      }

      return acc;
    }, {});
};

const cleanupExpiredAdminSessions = (now = Date.now()) => {
  for (const [token, session] of adminSessions.entries()) {
    if (!session || Number(session.expiresAt || 0) <= now) {
      adminSessions.delete(token);
    }
  }
};

const getAdminSessionTokenFromRequest = (req) => {
  const cookies = parseCookies(req.headers.cookie || "");
  return String(cookies[ADMIN_SESSION_COOKIE] || "").trim();
};

const createAdminSession = () => {
  cleanupExpiredAdminSessions();

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;

  adminSessions.set(token, { expiresAt });
  return { token, expiresAt };
};

const readAdminSession = (req) => {
  cleanupExpiredAdminSessions();

  const token = getAdminSessionTokenFromRequest(req);
  if (!token) {
    return null;
  }

  const session = adminSessions.get(token);
  if (!session) {
    return null;
  }

  const expiresAt = Number(session.expiresAt || 0);
  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return null;
  }

  return {
    token,
    expiresAt,
  };
};

const setAdminSessionCookie = (res, token) => {
  const maxAgeSeconds = Math.max(1, Math.floor(ADMIN_SESSION_TTL_MS / 1000));
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  res.set("Set-Cookie", parts.join("; "));
};

const clearAdminSessionCookie = (res) => {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  res.set("Set-Cookie", parts.join("; "));
};

const requireAdminSession = (req, res, next) => {
  const session = readAdminSession(req);
  if (!session) {
    res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    return;
  }

  req.adminSession = session;
  next();
};

const app = express();

app.use(cors());
app.use(express.json({ limit: "300kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/orders", async (_req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM orders ORDER BY updated_at DESC LIMIT ?",
      [ORDERS_LIMIT]
    );

    res.json({ data: rows.map(serializeOrder) });
  } catch (error) {
    console.error("Erro ao buscar pedidos", error);
    res.status(500).json({ error: "Falha ao buscar pedidos" });
  }
});

app.put("/api/orders/sync", async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.orders) ? req.body.orders : null;

    if (!incoming) {
      res.status(400).json({ error: "Campo orders inválido" });
      return;
    }

    const normalized = incoming
      .map(normalizeOrderRecord)
      .filter(Boolean)
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
      .slice(0, ORDERS_LIMIT);

    await replaceOrders(normalized);

    res.json({ ok: true, saved: normalized.length });
  } catch (error) {
    console.error("Erro ao sincronizar pedidos", error);
    res.status(500).json({ error: "Falha ao sincronizar pedidos" });
  }
});

app.delete("/api/orders", async (_req, res) => {
  try {
    await run("DELETE FROM orders");
    res.status(204).send();
  } catch (error) {
    console.error("Erro ao limpar pedidos", error);
    res.status(500).json({ error: "Falha ao limpar pedidos" });
  }
});

app.get("/api/store/products", async (_req, res) => {
  try {
    const rows = await listStoreProducts();
    res.json({ data: rows.map(serializeStoreProduct) });
  } catch (error) {
    console.error("Erro ao buscar produtos da loja", error);
    res.status(500).json({ error: "Falha ao buscar produtos da loja" });
  }
});

app.post("/api/admin/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();

  const validUser = safeCompare(username, ADMIN_USER);
  const validPassword = safeCompare(password, ADMIN_PASSWORD);

  if (!validUser || !validPassword) {
    res.status(401).json({ error: "Usuário ou senha inválidos" });
    return;
  }

  const session = createAdminSession();
  setAdminSessionCookie(res, session.token);

  res.json({
    ok: true,
    authenticated: true,
    username: ADMIN_USER,
    expiresAt: session.expiresAt,
    ttlMs: ADMIN_SESSION_TTL_MS,
  });
});

app.get("/api/admin/session", (req, res) => {
  const session = readAdminSession(req);
  if (!session) {
    res.status(401).json({ error: "Sessão não autenticada" });
    return;
  }

  res.json({
    ok: true,
    authenticated: true,
    username: ADMIN_USER,
    expiresAt: session.expiresAt,
    ttlMs: ADMIN_SESSION_TTL_MS,
  });
});

app.post("/api/admin/logout", (req, res) => {
  const token = getAdminSessionTokenFromRequest(req);
  if (token) {
    adminSessions.delete(token);
  }

  clearAdminSessionCookie(res);
  res.status(204).send();
});

app.use("/api/admin", requireAdminSession);

app.get("/api/admin/products", async (_req, res) => {
  try {
    const rows = await listAdminProducts();
    res.json({ data: rows.map(serializeAdminProduct) });
  } catch (error) {
    console.error("Erro ao listar produtos do admin", error);
    res.status(500).json({ error: "Falha ao listar produtos" });
  }
});

app.post("/api/admin/products", async (req, res) => {
  try {
    const result = await upsertProduct(req.body || null);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json({ data: result.data });
  } catch (error) {
    console.error("Erro ao criar produto", error);
    res.status(500).json({ error: "Falha ao criar produto" });
  }
});

app.put("/api/admin/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "ID de produto inválido" });
      return;
    }

    const existingRow = await getProductRowById(id);
    if (!existingRow) {
      res.status(404).json({ error: "Produto não encontrado" });
      return;
    }

    const result = await upsertProduct(req.body || null, existingRow);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ data: result.data });
  } catch (error) {
    console.error("Erro ao atualizar produto", error);
    res.status(500).json({ error: "Falha ao atualizar produto" });
  }
});

app.delete("/api/admin/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "ID de produto inválido" });
      return;
    }

    const existingRow = await getProductRowById(id);
    if (!existingRow) {
      res.status(404).json({ error: "Produto não encontrado" });
      return;
    }

    await run("DELETE FROM products WHERE id = ?", [id]);
    res.status(204).send();
  } catch (error) {
    console.error("Erro ao excluir produto", error);
    res.status(500).json({ error: "Falha ao excluir produto" });
  }
});

app.get("/admin.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/admin.js", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.js"));
});

app.use(express.static(__dirname));

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`DRINX server rodando em http://localhost:${PORT}`);
      console.log(`Banco SQLite: ${DB_FILE}`);
      console.log(
        `Painel admin em /admin.html com sessão de ${Math.floor(
          ADMIN_SESSION_TTL_MS / 60000
        )} minuto(s) (usuário padrão: ${ADMIN_USER})`
      );

      if (!process.env.DRINX_ADMIN_PASSWORD) {
        console.warn(
          "Usando senha admin padrão. Defina DRINX_ADMIN_PASSWORD para maior segurança."
        );
      }
    });
  })
  .catch((error) => {
    console.error("Falha ao iniciar banco de dados", error);
    process.exit(1);
  });

const shutdown = () => {
  db.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
