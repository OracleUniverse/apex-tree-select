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
    is_disabled,
    icon
FROM demo_tree
ORDER BY parent_id, id;
```

---

## 🧩 Data Source Configuration

Your **Tree Select Plugin** supports three main data source types for building hierarchical data:  
`SQL_QUERY`, `SQL_TABLE`, and `STATIC_JSON`.  
All data sources must include the following columns:

| Column | Description |
|---------|--------------|
| `ID` | Unique node identifier |
| `PARENT_ID` | Parent node ID (NULL for root nodes) |
| `LABEL` | Text displayed in the tree node |
| `IS_DISABLED` | `Y` or `N` — determines whether a node is selectable |
| `ICON` | (Optional) Font Awesome icon class name for each node |

---

### 🔹 Option 1: SQL Query Data Source

**Example:**
```sql
SELECT
    id,
    parent_id,
    label,
    is_disabled,
    icon
FROM demo_tree
ORDER BY parent_id, id;
```

Use this option when you want to define a **custom query**, filters, or joins.  
The plugin automatically builds the tree structure from the ID/PARENT_ID hierarchy.

---

### 🔹 Option 2: SQL Table Data Source

**Configuration:**
| Setting | Value |
|----------|--------|
| **Data Source Type** | `SQL_TABLE` |
| **Table / View** | `DEMO_TREE` |
| **ID Column** | `ID` |
| **Parent Column** | `PARENT_ID` |
| **Label Column** | `LABEL` |
| **Disabled Expression** | `IS_DISABLED` |
| **Icon Expression** | `ICON` |

Use this when you want to directly bind your table to the plugin without writing SQL manually.

---

### 🔹 Option 3: Static JSON Data Source

For quick demos or static hierarchies, you can paste JSON directly in the region settings.

**Example:**
```json
[
  { "id": 1, "parent_id": null, "label": "Corporate",   "is_disabled": "N", "icon": "fa fa-building" },
  { "id": 2, "parent_id": 1,    "label": "HR",          "is_disabled": "N", "icon": "fa fa-users" },
  { "id": 3, "parent_id": 2,    "label": "Recruiting",  "is_disabled": "N", "icon": "fa fa-user-plus" },
  { "id": 4, "parent_id": 2,    "label": "Payroll",     "is_disabled": "Y", "icon": "fa fa-credit-card" },
  { "id": 5, "parent_id": 1,    "label": "IT",          "is_disabled": "N", "icon": "fa fa-desktop" },
  { "id": 6, "parent_id": 5,    "label": "Networks",    "is_disabled": "N", "icon": "fa fa-sitemap" },
  { "id": 7, "parent_id": 5,    "label": "Security",    "is_disabled": "N", "icon": "fa fa-shield" },
  { "id": 8, "parent_id": null, "label": "Operations",  "is_disabled": "N", "icon": "fa fa-cogs" }
]
```

---

### 🧠 Notes

- **Lazy loading** and **per-node icons** are fully supported.  
- The plugin automatically disables nodes with `IS_DISABLED = 'Y'`.  
- Each region instance must have a **unique Static ID** to avoid conflicts.  
- Use hidden item `PXX_TREE_SELECTED` to store selected node IDs.  


## Example SQL Data Source

```sql
SELECT
    id,
    parent_id,
    label,
    is_disabled,
    icon
FROM demo_tree
ORDER BY parent_id, id
```

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



## 🌟 Features and Capabilities Overview

### 🌳 Tree Functionality
- Full tri-state checkbox tree integrated with Oracle APEX page items and Dynamic Actions.
- Parent/child recompute logic that respects disabled nodes and supports mixed states.
- Dynamic expand and collapse per node, plus toolbar buttons to expand/collapse all.
- Client and Server search modes, both supporting SQL-style wildcards (`%` and `_`).
- Shift-click style bulk operations (Check All / Uncheck All) for fast selection changes.
- Optimized behavior for large data sets with optional lazy loading of child nodes.

### 💅 User Interface & Styling
- Toolbar with expand, collapse, check, uncheck, and search controls.
- Layout that works well for faceted-style pages (search above, controls on the side of the tree).
- Per-node icons using the `ICON` column, fully themeable via CSS.
- Universal Theme–friendly colors and typography so the tree blends with the rest of the application.
- Accessible markup using `role="tree"`, `aria-expanded`, and `aria-hidden` where appropriate.
- Self-contained dialog behavior that avoids interfering with page scroll or global overlays.

### ⚙️ Integration & Configuration
- Implemented as a declarative APEX region plugin, configured entirely inside the builder.
- Supports custom Dynamic Actions such as **Tree Select – Changed**, **Tree Select – Search**, and **Tree Select – Loaded**.
- Works with multiple data source types (SQL Query, SQL Table, Static JSON, and REST-based sources via APEX).
- Designed for modern APEX 21+ with Universal Theme, and can be configured to work with older APEX versions if required.
- No external JavaScript libraries required; ships with its own JS and CSS bundle.

In short, the Tree Select Plugin provides a rich, maintainable, and APEX-native way to present and manage hierarchical data with checkboxes, while remaining flexible enough to support use cases like filtering reports, faceted search, and navigation trees.

---


## 🛠 Future Enhancements

These features are planned for future versions:

- 🧩 **Expand/Collapse State Memory**  
  Remember which nodes were expanded and restore them automatically on page refresh.  
- 🧠 **Improved Accessibility & Keyboard Navigation**  
  Streamline focus order and add ARIA role refinements for screen readers.  
- 🔁 **Optional Drag-and-Drop Reordering**  
  Allow reordering of tree nodes with server-side persistence.  

*(Features like lazy loading and per-node icons are already supported in this version.)*


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

