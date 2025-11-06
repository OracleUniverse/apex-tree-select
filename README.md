# 🌳 Tree Select Plugin for Oracle APEX

### Developed by [Mohammad Alquran](https://oracleuniverse.cloud)  
**Version 1.0 — November 2025**

---

## 🧩 Overview

The **Tree Select Plugin** for **Oracle APEX** adds an advanced, checkbox-enabled hierarchical tree to your applications.  
It supports both **client-side** and **server-side** data loading, **tri-state selection**, and **context menus**, making it ideal for complex data selection interfaces and faceted search panels.

This plugin is designed for developers who need:
- A fast, responsive tree structure.
- Checkbox support for parent–child selection.
- Customizable behavior and APEX integration.
- A modern appearance consistent with the Universal Theme.

---

## 🚀 Key Features

- ✅ Checkbox Tree with tri-state logic (parents reflect children state).  
- 🔍 Built-in search (client or server mode, with wildcard support).  
- 🌲 Expand / Collapse / Check / Uncheck All toolbar buttons.  
- ⚡ Hotkeys and accessibility support (ARIA-friendly markup).  
- 🎨 Customizable CSS — color themes, connector lines, compact layout.  
- 🔧 Works seamlessly with **APEX Dynamic Actions**.  
- 🔗 Compatible with **APEX 19.2 → 24.1** (tested).  
- 💾 Supports **JSON**, **SQL**, and **PL/SQL** data sources.

---

## ⚙️ Installation & Basic Setup

1. **Import the plugin**  
   - Go to **Shared Components → Plug-ins → Import**.  
   - Upload the plugin export file (e.g. `TreeSelectPlugin.sql`).  

2. **Create a hidden item for the selection**  
   - Create a new item on your page:  
     - Item Name: `PXX_TREE_SELECTED` (replace `XX` with your page number, e.g. `P10_TREE_SELECTED`).  
     - Item Type: **Hidden**.  
   - This item will store the selected node IDs (CSV or JSON).  

3. **Create the region using the plugin**  
   - Add a new **Region** to your page.  
   - Region Type: **Tree Select Plugin for Oracle APEX**.  
   - Set the region **Static ID** to:  
     ```text
     empTreeRegion
     ```

4. **Configure plugin attributes**  
   Inside the region attributes, configure at least:
   - **Data Source Type**: SQL Query / Table / JSON.  
   - **Allow Parent Selection**: Yes/No.  
   - **Allow Leaf Selection**: Yes/No.  
   - **Tri-State**: Yes (if you want mixed parent states).  
   - **Default Expand Level**: e.g. `1` or `2`.  
   - **Search Mode**: `CLIENT`, `SERVER`, or `NONE`.  
   - **Store Item**: set to `PXX_TREE_SELECTED`.  

5. **Static file URLs (if not auto-included)**  
   In the plugin definition or page-level file URLs, ensure:
   ```text
   #PLUGIN_FILES#xx_tree_select.js
   #PLUGIN_FILES#xx_tree_select.css
   ```

---

## 🧱 Example Usage

### Example SQL Data Source

```sql
SELECT
    id,
    parent_id,
    label,
    value,
    is_disabled
FROM demo_tree_table
ORDER BY parent_id, id
```
## 🧩 Data Source Configuration

Your **Tree Select Plugin** supports multiple data source types for building the hierarchical structure — including `SQL_TABLE`, `SQL_QUERY`, and `STATIC_JSON`.  
Below are examples for both common setups.

---

### 🔹 Option 1: Static JSON Data Source

This is the simplest and most portable setup — ideal for testing, demos, or static hierarchies.

**How to configure:**
1. In the plugin region, under **Settings**, choose  
   **Data Source Type → `STATIC_JSON`**
2. Paste the following sample JSON into the Static Data field:

```json
[
  { "id": 1, "parentId": null, "label": "Corporate",   "hasChildren": 1, "leaf": 0, "icon": "fa fa-building" },
  { "id": 2, "parentId": 1,    "label": "HR",          "hasChildren": 1, "leaf": 0, "icon": "fa fa-users" },
  { "id": 3, "parentId": 2,    "label": "Recruiting",  "hasChildren": 0, "leaf": 1, "icon": "fa fa-user-plus" },
  { "id": 4, "parentId": 2,    "label": "Payroll",     "hasChildren": 0, "leaf": 1, "disabled": 1 },
  { "id": 5, "parentId": 1,    "label": "IT",          "hasChildren": 1, "leaf": 0, "icon": "fa fa-desktop" },
  { "id": 6, "parentId": 5,    "label": "Networks",    "hasChildren": 0, "leaf": 1 },
  { "id": 7, "parentId": 5,    "label": "Security",    "hasChildren": 0, "leaf": 1, "selected": 1 },
  { "id": 8, "parentId": null, "label": "Operations",  "hasChildren": 0, "leaf": 1 }
]
```

**Fields explanation:**
| Field | Description |
|-------|--------------|
| `id` | Unique node identifier |
| `parentId` | Parent node ID (null = root) |
| `label` | Node display text |
| `hasChildren` | 1 if the node has children |
| `leaf` | 1 if the node is a leaf |
| `icon` | (Optional) Font Awesome icon class |
| `disabled` | (Optional) 1 = non-selectable node |
| `selected` | (Optional) 1 = preselected node |

---

### 🔹 Option 2: SQL Table Data Source

For dynamic or large hierarchies, use a database table.  
This lets the plugin query rows from your schema (e.g., `DEMO_TREE`).

**Example table structure:**
```sql
CREATE TABLE demo_tree (
    id            NUMBER PRIMARY KEY,
    parent_id     NUMBER,
    label         VARCHAR2(200),
    is_disabled   NUMBER(1),
    icon          VARCHAR2(100)
);
```

**Example data:**
```sql
INSERT INTO demo_tree (id, parent_id, label, is_disabled, icon) VALUES (1, NULL, 'Computers & Laptops', 0, 'fa fa-laptop');
INSERT INTO demo_tree (id, parent_id, label, is_disabled, icon) VALUES (2, 1, 'Laptops', 0, 'fa fa-laptop');
INSERT INTO demo_tree (id, parent_id, label, is_disabled, icon) VALUES (3, 2, 'Gaming Laptop', 0, 'fa fa-gamepad');
INSERT INTO demo_tree (id, parent_id, label, is_disabled, icon) VALUES (4, 1, 'Desktops', 0, 'fa fa-desktop');
```

**APEX Region Settings:**

| Setting | Value |
|----------|--------|
| **Data Source Type** | `SQL_TABLE` |
| **SQL: Table / View** | `DEMO_TREE` |
| **SQL: ID Column** | `ID` |
| **SQL: Parent Column** | `PARENT_ID` |
| **SQL: Label Column** | `LABEL` |
| **SQL: Disabled Expression** | `IS_DISABLED` |
| **SQL: Icon Expression** | `ICON` |

**Notes:**
- The plugin automatically builds the hierarchy based on the **ID** / **Parent ID** relationship.  
- Disabled nodes are shown but cannot be checked.  
- If icons are provided, they will render beside each label using Font Awesome classes.

---

### 🧠 Tips

- For performance with **large datasets**, use **Server Mode** to lazy-load branches.  
- For client-side filtering and instant highlighting, use **Client Mode**.  
- Each region instance should have a **unique Static ID**, e.g.:
  ```text
  empTreeRegion1, empTreeRegion2
  ```
  so that the CSS and events do not overlap between multiple trees.

---

### Initialization in APEX (handled automatically)

The plugin will automatically call the initializer similar to:

```javascript
xxTreeSelectInit({
  staticId: "empTreeRegion",
  storeItem: "PXX_TREE_SELECTED",
  storeFormat: "JSON",
  allowParent: true,
  allowLeaf: true,
  triState: true,
  defaultExpand: 1,
  searchMode: "CLIENT",
  hotkeys: true
});
```

You do **not** need to write this manually; it is shown here only to explain how the configuration is used.

---

## 🧮 Integration with Dynamic Actions

The plugin integrates smoothly with Dynamic Actions in Oracle APEX.

### 1. Reacting to selection changes

1. Use `PXX_TREE_SELECTED` as an event source.  
2. Create a **Dynamic Action** on **Change** of item `PXX_TREE_SELECTED`.  
3. Action: **Refresh** a report or chart region that depends on the selected IDs.

The item value will contain either:
- A **CSV list** (e.g. `10,20,30`), or  
- A **JSON array** (e.g. `["10","20","30"]`),  
depending on the `storeFormat` plugin setting.

### 2. Calling tree operations from JavaScript

You can call plugin methods against the region static ID (`empTreeRegion`):

```javascript
// Expand all nodes
apex.region("empTreeRegion").widget().xxTreeSelect("expandAll");

// Collapse all nodes
apex.region("empTreeRegion").widget().xxTreeSelect("collapseAll");

// Check all enabled nodes
apex.region("empTreeRegion").widget().xxTreeSelect("checkAll");

// Uncheck all
apex.region("empTreeRegion").widget().xxTreeSelect("uncheckAll");
```

(Exact method names depend on your final JS API; adjust as needed.)

---

## 🎨 Customization (CSS)

You can customize the look & feel by editing or overriding `xx_tree_select.css`.

Examples:

```css
/* Round toolbar buttons and add spacing */
.t-TreeSelect .ts-toolbar button {
  border-radius: 8px;
  margin: 0 4px;
}

/* Change connector line color */
.t-TreeSelect-list li::before {
  border-left-color: #9ca3af; /* Tailwind gray-400 like */
}

/* Highlight search hits */
.t-TreeSelect mark.ts-hit {
  background-color: #facc15; /* amber-400 */
  padding: 0 2px;
  border-radius: 3px;
}
```

You can add these overrides in:
- Page → CSS → **Inline** or **File URLs**, or  
- App-level CSS file.

---

## 🧭 Browser Support

- ✅ Google Chrome  
- ✅ Microsoft Edge  
- ✅ Mozilla Firefox  
- ✅ Safari  

The plugin is designed to be responsive and works well in:
- Standard content pages.  
- APEX modal dialogs.  
- Side panels used for faceted-style filtering.

---

## 🤝 APEX Version Compatibility

| APEX Version | Supported | Notes |
|-------------:|:---------:|------|
| 19.2         | ✅        | Core features supported |
| 20.x–22.x    | ✅        | Fully compatible |
| 23.x–24.1    | ✅        | Tested with Universal Theme updates |

If you upgrade APEX, re-test the Tree Select region and update CSS if Universal Theme spacing/colors change.

---

## 🛠 Planned / Future Enhancements

- Lazy loading for very large trees (load children on demand).  
- Per-node icons based on data attributes.  
- Remembering expand/collapse state per user.  
- More keyboard shortcuts and accessibility refinements.  
- Optional drag-and-drop reordering with server persistence.

---

## 💖 Support the Project

If you find **Tree Select Plugin for Oracle APEX** helpful in your applications,  
you can support its continued development and future enhancements.

Your support helps keep this plugin open, documented, and frequently updated.

**Support options:**

[![Donate](https://img.shields.io/badge/☕_Donate-via_PayPal-blue?logo=paypal)](https://paypal.me/mtmnq)
[![WhatsApp](https://img.shields.io/badge/Chat_on-WhatsApp-green?logo=whatsapp)](https://wa.me/962777437216)

- ☕ **Donate via PayPal:** <https://paypal.me/mtmnq>  
- 💬 **Chat on WhatsApp:** <https://wa.me/962777437216>

Or visit the project page:  
🌐 [oracleuniverse.cloud](https://oracleuniverse.cloud)

---

## 📄 License

Released under the **MIT License**.  
Free for personal and commercial use — attribution appreciated.

---

## 👨‍💻 Author & Contact

**Mohammad Alquran**  
🌐 Website: [oracleuniverse.cloud](https://oracleuniverse.cloud)  
💌 Email: [moh.alquraan@gmail.com](mailto:moh.alquraan@gmail.com)  
💬 WhatsApp: <https://wa.me/962777437216>



---

