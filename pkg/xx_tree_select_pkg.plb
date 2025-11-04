create or replace PACKAGE BODY xx_tree_select_pkg AS
  ----------------------------------------------------------------------------
  -- Small helpers
  ----------------------------------------------------------------------------
  FUNCTION is_true(p_val IN VARCHAR2) RETURN BOOLEAN IS
  BEGIN
    RETURN UPPER(NVL(p_val,'N')) IN ('Y','YES','TRUE','1');
  END;
  FUNCTION nz(p_val IN VARCHAR2, p_def IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN p_val IS NULL THEN p_def ELSE p_val END;
  END;
  FUNCTION num_flag(p_val IN VARCHAR2) RETURN NUMBER IS
  BEGIN
    RETURN CASE WHEN UPPER(NVL(p_val,'N')) IN ('Y','YES','TRUE','1') THEN 1 ELSE 0 END;
  END;

  ----------------------------------------------------------------------------
  -- RENDER (keeps your CSP-safe init pattern)
  ----------------------------------------------------------------------------
  PROCEDURE render (
    p_plugin IN            apex_plugin.t_plugin,
    p_region IN            apex_plugin.t_region,
    p_param  IN            apex_plugin.t_region_render_param,
    p_result IN OUT NOCOPY apex_plugin.t_region_render_result
  ) IS
    -- Behavior / UX
    l_show_search    BOOLEAN       := p_region.attributes.get_boolean('show_search');
    l_lazy           BOOLEAN       := p_region.attributes.get_boolean('lazy_load');
    l_expand_lvls    NUMBER        := NVL(p_region.attributes.get_number('default_expand_levels'), 0);
    l_store_item     VARCHAR2(200) := p_region.attributes.get_varchar2('store_item');
    l_store_fmt      VARCHAR2(30)  := NVL(p_region.attributes.get_varchar2('store_format'), 'JSON');
    l_allow_parent   BOOLEAN       := NVL(p_region.attributes.get_boolean('allow_parent'), TRUE);
    l_allow_leaf     BOOLEAN       := NVL(p_region.attributes.get_boolean('allow_leaf'), TRUE);
    l_tristate       BOOLEAN       := NVL(p_region.attributes.get_boolean('tristate'), TRUE);
    l_search_mode    VARCHAR2(10)  := NVL(p_region.attributes.get_varchar2('search_mode'), 'CLIENT');
    l_compact_rows   BOOLEAN       := NVL(p_region.attributes.get_boolean('compact_rows'), FALSE);
    l_has_icons      BOOLEAN       := NVL(p_region.attributes.get_boolean('has_icons'), TRUE);

    -- Data source attributes
    l_src_type         VARCHAR2(20)  := NVL(p_region.attributes.get_varchar2('data_source_type'),'STATIC_JSON');
    l_static_json      CLOB          := TO_CLOB(p_region.attributes.get_varchar2('static_json'));

    l_sql_table        VARCHAR2(128) := p_region.attributes.get_varchar2('sql_table');
    l_sql_col_id       VARCHAR2(256) := p_region.attributes.get_varchar2('sql_col_id');
    l_sql_col_parent   VARCHAR2(256) := p_region.attributes.get_varchar2('sql_col_parent');
    l_sql_col_label    VARCHAR2(512) := p_region.attributes.get_varchar2('sql_col_label');
    l_sql_col_disabled VARCHAR2(512) := p_region.attributes.get_varchar2('sql_col_disabled');
    l_sql_col_icon     VARCHAR2(512) := p_region.attributes.get_varchar2('sql_col_icon');

    l_sql_query        CLOB          := TO_CLOB(p_region.attributes.get_varchar2('sql_query'));

    -- DOM + ajax
    l_region_static_id VARCHAR2(255) := NVL(p_region.static_id, 'R'||p_region.id);
    l_widget_id        VARCHAR2(255) := l_region_static_id||'_ts';
    l_title            VARCHAR2(32767):= NVL(p_region.title, 'Tree');
    l_ajax_id          VARCHAR2(4000) := apex_plugin.get_ajax_identifier;
  BEGIN
    -- Container + toolbar + list
    HTP.p(
      '<div id="'||apex_escape.html_attribute(l_widget_id)||'" '||
      'class="t-TreeSelect'||CASE WHEN l_compact_rows THEN ' ts-compact' END||'" '||
      'role="region" aria-label="'||apex_escape.html_attribute(l_title)||'">'
    );
    HTP.p('<div class="ts-toolbar">');
    IF l_show_search THEN
      HTP.p('<input type="text" data-tree-role="search" class="t-Form-input ts-search" placeholder="Search..." />');
      HTP.P('<br>');
    END IF;
    HTP.p('<button type="button" class="t-Button t-Button--noUI ts-expandAll" title="Expand all" aria-label="Expand all">＋</button>');
    HTP.p('<button type="button" class="t-Button t-Button--noUI ts-collapseAll" title="Collapse all" aria-label="Collapse all">－</button>');
    -- NEW: Check/Uncheck All
    HTP.p('<button type="button" class="t-Button t-Button--noUI ts-checkAll" title="Check all" aria-label="Check all">☑</button>');
    HTP.p('<button type="button" class="t-Button t-Button--noUI ts-uncheckAll" title="Uncheck all" aria-label="Uncheck all">□</button>');
    HTP.p('</div>');
    HTP.p('<ul class="t-TreeSelect-list" data-tree-role="list" role="tree"></ul>');
    HTP.p('</div>');

    -- JS init (CSP-safe)
    apex_javascript.add_onload_code(
      'window.xxTreeSelectInit && window.xxTreeSelectInit({'||
        'staticId:"'||apex_escape.html(l_widget_id)||'",'||
        'ajaxIdentifier:"'||l_ajax_id||'",'||
        'lazy:'||CASE WHEN l_lazy THEN 'true' ELSE 'false' END||','||
        'defaultExpand:'||TO_CHAR(l_expand_lvls)||','||
        'storeItem:'||CASE WHEN l_store_item IS NULL THEN 'null' ELSE '"'||apex_escape.html(l_store_item)||'"' END||','||
        'storeFormat:"'||apex_escape.html(l_store_fmt)||'",'||
        'allowParent:'||CASE WHEN l_allow_parent THEN 'true' ELSE 'false' END||','||
        'allowLeaf:'||CASE WHEN l_allow_leaf THEN 'true' ELSE 'false' END||','||
        'triState:'||CASE WHEN l_tristate THEN 'true' ELSE 'false' END||','||
        'searchMode:"'||apex_escape.html(l_search_mode)||'",'||
        'hasIcons:'||CASE WHEN l_has_icons THEN 'true' ELSE 'false' END||','||
        'dataSourceType:"'||apex_escape.html(l_src_type)||'"'||
      '});'
    );
  END render;

  ----------------------------------------------------------------------------
  -- AJAX
  ----------------------------------------------------------------------------
  PROCEDURE ajax (
    p_plugin IN            apex_plugin.t_plugin,
    p_region IN            apex_plugin.t_region,
    p_param  IN            apex_plugin.t_region_ajax_param,
    p_result IN OUT NOCOPY apex_plugin.t_region_ajax_result
  ) IS
    -- Incoming flags
    l_action     VARCHAR2(20)   := LOWER(apex_application.g_x01);  -- roots|children|children_batch|search
    l_parent_id  VARCHAR2(4000) := apex_application.g_x02;          -- parent id OR CSV for batch
    l_search_raw VARCHAR2(4000) := apex_application.g_x03;
    l_search     VARCHAR2(4000);

    -- Region attributes
    l_src_type         VARCHAR2(20)  := NVL(p_region.attributes.get_varchar2('data_source_type'),'STATIC_JSON');

    -- STATIC JSON
    l_static_json      CLOB          := TO_CLOB(p_region.attributes.get_varchar2('static_json'));

    -- SQL: Table / View
    l_sql_table        VARCHAR2(128) := p_region.attributes.get_varchar2('sql_table');
    l_sql_col_id       VARCHAR2(256) := p_region.attributes.get_varchar2('sql_col_id');
    l_sql_col_parent   VARCHAR2(256) := p_region.attributes.get_varchar2('sql_col_parent');
    l_sql_col_label    VARCHAR2(512) := p_region.attributes.get_varchar2('sql_col_label');
    l_sql_col_disabled VARCHAR2(512) := p_region.attributes.get_varchar2('sql_col_disabled'); -- boolean expr (optional)
    l_sql_col_icon     VARCHAR2(512) := p_region.attributes.get_varchar2('sql_col_icon');     -- icon expr (optional)

    -- Free SQL
    l_sql_query        CLOB          := TO_CLOB(p_region.attributes.get_varchar2('sql_query'));

    -- Dyn SQL plumbing
    TYPE t_rc IS REF CURSOR;
    rc     t_rc;

    v_id     VARCHAR2(4000);
    v_parent VARCHAR2(4000);
    v_label  VARCHAR2(4000);
    v_has    NUMBER;
    v_leaf   NUMBER;
    v_dis    NUMBER;
    v_icn    VARCHAR2(4000);

    l_sql   CLOB;

    -- optional fragments for SQL_QUERY
    l_is_disabled_expr  VARCHAR2(32767) := '0';
    l_icon_expr_roots   VARCHAR2(32767) := 'CASE WHEN EXISTS (SELECT 1 FROM q c WHERE c.parent_id = q.id) THEN ''fa fa-folder'' ELSE ''fa fa-file'' END';
    l_icon_expr_child   VARCHAR2(32767) := l_icon_expr_roots;
    l_icon_expr_search  VARCHAR2(32767) := 'CASE WHEN EXISTS (SELECT 1 FROM q c JOIN incl i ON i.id = c.id WHERE c.parent_id = q.id) THEN ''fa fa-folder'' ELSE ''fa fa-file'' END';

    -- node writer
    PROCEDURE write_node (
      p_id           VARCHAR2,
      p_parent       VARCHAR2,
      p_label        VARCHAR2,
      p_has_children NUMBER,
      p_is_leaf      NUMBER,
      p_disabled     NUMBER,
      p_icon         VARCHAR2
    ) IS
    BEGIN
      apex_json.open_object;
      apex_json.write('id',          p_id);
      apex_json.write('parentId',    p_parent);
      apex_json.write('label',       p_label);
      apex_json.write('hasChildren', p_has_children);
      apex_json.write('leaf',        p_is_leaf);
      apex_json.write('disabled',    p_disabled);
      apex_json.write('icon',        p_icon);
      apex_json.close_object;
    END;

  BEGIN
    l_search := TRIM(l_search_raw);

    ----------------------------------------------------------------------------
    -- STATIC_JSON: stream raw JSON and exit (no apex_json.open_array here)
    ----------------------------------------------------------------------------
    IF l_src_type = 'STATIC_JSON' THEN
      IF l_static_json IS NOT NULL THEN
        htp.p(l_static_json);
      ELSE
        htp.p('[]');
      END IF;
      RETURN;
    END IF;

    ----------------------------------------------------------------------------
    -- For SQL sources, we wrap output as a JSON array
    ----------------------------------------------------------------------------
    apex_json.open_array;

    ----------------------------------------------------------------------------
    -- SQL_TABLE / SQL_VIEW
    ----------------------------------------------------------------------------
    IF l_src_type = 'SQL_TABLE' THEN
      IF l_sql_table IS NULL OR l_sql_col_id IS NULL OR l_sql_col_parent IS NULL OR l_sql_col_label IS NULL THEN
        NULL; -- not configured; return empty array
      ELSE
        IF l_action = 'roots' OR (l_action = 'search' AND l_search IS NULL) THEN
          l_sql :=
            'SELECT '||l_sql_col_id||' id,'||
            '       '||l_sql_col_parent||' parent_id,'||
            '       '||l_sql_col_label||' label,'||
            '       CASE WHEN EXISTS (SELECT 1 FROM '||l_sql_table||' c WHERE c.'||l_sql_col_parent||' = t.'||l_sql_col_id||') THEN 1 ELSE 0 END has_children,'||
            '       CASE WHEN EXISTS (SELECT 1 FROM '||l_sql_table||' c WHERE c.'||l_sql_col_parent||' = t.'||l_sql_col_id||') THEN 0 ELSE 1 END is_leaf,'||
            '       '||CASE
                        WHEN l_sql_col_disabled IS NOT NULL THEN 'CASE WHEN NVL('||l_sql_col_disabled||',''N'') IN (''Y'',''1'',''TRUE'',''true'') THEN 1 ELSE 0 END'
                        ELSE '0'
                      END||' AS is_disabled,'||
            '       '||COALESCE(l_sql_col_icon,
                                'CASE WHEN EXISTS (SELECT 1 FROM '||l_sql_table||' c WHERE c.'||l_sql_col_parent||' = t.'||l_sql_col_id||') THEN ''fa fa-folder'' ELSE ''fa fa-file'' END')
                      ||' AS icon '||
            'FROM '||l_sql_table||' t '||
            'WHERE '||l_sql_col_parent||' IS NULL '||
            'ORDER BY '||l_sql_col_label;

          OPEN rc FOR l_sql;
          LOOP
            FETCH rc INTO v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn; EXIT WHEN rc%NOTFOUND;
            write_node(v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn);
          END LOOP;
          CLOSE rc;

        ELSIF l_action = 'children' THEN
          l_sql :=
            'SELECT '||l_sql_col_id||' id,'||
            '       '||l_sql_col_parent||' parent_id,'||
            '       '||l_sql_col_label||' label,'||
            '       CASE WHEN EXISTS (SELECT 1 FROM '||l_sql_table||' c WHERE c.'||l_sql_col_parent||' = t.'||l_sql_col_id||') THEN 1 ELSE 0 END has_children,'||
            '       CASE WHEN EXISTS (SELECT 1 FROM '||l_sql_table||' c WHERE c.'||l_sql_col_parent||' = t.'||l_sql_col_id||') THEN 0 ELSE 1 END is_leaf,'||
            '       '||CASE
                        WHEN l_sql_col_disabled IS NOT NULL THEN 'CASE WHEN NVL('||l_sql_col_disabled||',''N'') IN (''Y'',''1'',''TRUE'',''true'') THEN 1 ELSE 0 END'
                        ELSE '0'
                      END||' AS is_disabled,'||
            '       '||COALESCE(l_sql_col_icon,
                                'CASE WHEN EXISTS (SELECT 1 FROM '||l_sql_table||' c WHERE c.'||l_sql_col_parent||' = t.'||l_sql_col_id||') THEN ''fa fa-folder'' ELSE ''fa fa-file'' END')
                      ||' AS icon '||
            'FROM '||l_sql_table||' t '||
            'WHERE '||l_sql_col_parent||' = :PARENT_ID '||
            'ORDER BY '||l_sql_col_label;

          OPEN rc FOR l_sql USING l_parent_id;
          LOOP
            FETCH rc INTO v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn; EXIT WHEN rc%NOTFOUND;
            write_node(v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn);
          END LOOP;
          CLOSE rc;

        ELSIF l_action = 'children_batch' THEN
  -- batch load children for many parents (numeric IDs)
  l_sql :=
    'SELECT '||l_sql_col_id||' id,'||
    '       '||l_sql_col_parent||' parent_id,'||
    '       '||l_sql_col_label||' label,'||
    '       CASE WHEN EXISTS (SELECT 1 FROM '||l_sql_table||' c WHERE c.'||l_sql_col_parent||' = t.'||l_sql_col_id||') THEN 1 ELSE 0 END has_children,'||
    '       CASE WHEN EXISTS (SELECT 1 FROM '||l_sql_table||' c WHERE c.'||l_sql_col_parent||' = t.'||l_sql_col_id||') THEN 0 ELSE 1 END is_leaf,'||
    '       '||CASE
                WHEN l_sql_col_disabled IS NOT NULL THEN 'CASE WHEN NVL('||l_sql_col_disabled||',''N'') IN (''Y'',''1'',''TRUE'',''true'') THEN 1 ELSE 0 END'
                ELSE '0'
              END||' AS is_disabled,'||
    '       '||COALESCE(l_sql_col_icon,
                        'CASE WHEN EXISTS (SELECT 1 FROM '||l_sql_table||' c WHERE c.'||l_sql_col_parent||' = t.'||l_sql_col_id||') THEN ''fa fa-folder'' ELSE ''fa fa-file'' END')
              ||' AS icon '||
    'FROM '||l_sql_table||' t '||
    'WHERE '||l_sql_col_parent||' IN ('||
    '  SELECT TO_NUMBER(column_value) FROM TABLE(apex_string.split(:1, '',''))'||
    ') '||
    'ORDER BY '||l_sql_col_parent||', '||l_sql_col_label;

  OPEN rc FOR l_sql USING l_parent_id; -- CSV passed in g_x02
  LOOP
    FETCH rc INTO v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn; EXIT WHEN rc%NOTFOUND;
    write_node(v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn);
  END LOOP;
  CLOSE rc;



        ELSIF l_action = 'search' AND l_search IS NOT NULL THEN
          -- matches + ancestors (keep structure)
          l_sql :=
            'WITH q AS ('||
            '  SELECT '||l_sql_col_id||' id,'||
            '         '||l_sql_col_parent||' parent_id,'||
            '         '||l_sql_col_label||' label,'||
            '         '||COALESCE(l_sql_col_icon, 'NULL')||' icon,'||
            '         '||CASE WHEN l_sql_col_disabled IS NOT NULL THEN '('||l_sql_col_disabled||')' ELSE 'NULL' END||' is_disabled '||
            '    FROM '||l_sql_table||
            '),'||
            ' hits AS (SELECT id FROM q WHERE UPPER(label) LIKE ''%'' || UPPER(:SEARCH) || ''%''),'||
            ' incl AS ('||
            '   SELECT DISTINCT q.id FROM q'||
            '    START WITH q.id IN (SELECT id FROM hits)'||
            '    CONNECT BY PRIOR q.parent_id = q.id'||
            ' )'||
            ' SELECT q.id, q.parent_id, q.label,'||
            ' CASE WHEN EXISTS (SELECT 1 FROM q c JOIN incl i ON i.id = c.id WHERE c.parent_id = q.id) THEN 1 ELSE 0 END has_children,'||
            ' CASE WHEN EXISTS (SELECT 1 FROM q c JOIN incl i ON i.id = c.id WHERE c.parent_id = q.id) THEN 0 ELSE 1 END is_leaf,'||
            ' CASE WHEN NVL(q.is_disabled,''N'') IN (''Y'',''1'',''TRUE'',''true'') THEN 1 ELSE 0 END AS is_disabled,'||
            ' NVL(q.icon, CASE WHEN EXISTS (SELECT 1 FROM q c JOIN incl i ON i.id = c.id WHERE c.parent_id = q.id) THEN ''fa fa-folder'' ELSE ''fa fa-file'' END) AS icon'||
            ' FROM q JOIN incl i ON i.id = q.id'||
            ' ORDER BY q.parent_id NULLS FIRST, q.label';

          OPEN rc FOR l_sql USING l_search;
          LOOP
            FETCH rc INTO v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn; EXIT WHEN rc%NOTFOUND;
            write_node(v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn);
          END LOOP;
          CLOSE rc;
        END IF;
      END IF; -- configured

    ----------------------------------------------------------------------------
    -- SQL_QUERY (free SQL; we wrap with WITH q AS (...))
    ----------------------------------------------------------------------------
    ELSIF l_src_type = 'SQL_QUERY' THEN
      DECLARE
        has_is_disabled  BOOLEAN := FALSE;
        has_icon         BOOLEAN := FALSE;
        has_icon_css     BOOLEAN := FALSE;
        ctx apex_exec.t_context;
        col apex_exec.t_column;
      BEGIN
        IF l_sql_query IS NOT NULL THEN
          -- probe columns (1 row)
          BEGIN
            ctx := apex_exec.open_query_context(
                     p_location  => apex_exec.c_location_local_db,
                     p_sql_query => l_sql_query,
                     p_max_rows  => 1
                   );
            FOR i IN 1 .. apex_exec.get_column_count(ctx) LOOP
              col := apex_exec.get_column(ctx, i);
              IF LOWER(col.name) = 'is_disabled' THEN
                has_is_disabled := TRUE;
              ELSIF LOWER(col.name) = 'icon' THEN
                has_icon := TRUE;
              ELSIF LOWER(col.name) = 'icon_css' THEN
                has_icon_css := TRUE;
              END IF;
            END LOOP;
            apex_exec.close(ctx);
          EXCEPTION
            WHEN OTHERS THEN
              BEGIN apex_exec.close(ctx); EXCEPTION WHEN OTHERS THEN NULL; END;
              has_is_disabled := FALSE;
              has_icon        := FALSE;
              has_icon_css    := FALSE;
          END;

          -- set fragments
          IF has_is_disabled THEN
            l_is_disabled_expr := 'CASE WHEN NVL(q.is_disabled,''N'') IN (''Y'',''1'',''TRUE'',''true'') THEN 1 ELSE 0 END';
          ELSE
            l_is_disabled_expr := '0';
          END IF;

          IF has_icon THEN
            l_icon_expr_roots  := 'NVL(q.icon, ''fa fa-file'')';
            l_icon_expr_child  := 'NVL(q.icon, ''fa fa-file'')';
            l_icon_expr_search := 'NVL(q.icon, ''fa fa-file'')';
          ELSIF has_icon_css THEN
            l_icon_expr_roots  := 'NVL(q.icon_css, ''fa fa-file'')';
            l_icon_expr_child  := 'NVL(q.icon_css, ''fa fa-file'')';
            l_icon_expr_search := 'NVL(q.icon_css, ''fa fa-file'')';
          ELSE
            l_icon_expr_roots  := 'CASE WHEN EXISTS (SELECT 1 FROM q c WHERE c.parent_id = q.id) THEN ''fa fa-folder'' ELSE ''fa fa-file'' END';
            l_icon_expr_child  := l_icon_expr_roots;
            l_icon_expr_search := 'CASE WHEN EXISTS (SELECT 1 FROM q c JOIN incl i ON i.id = c.id WHERE c.parent_id = q.id) THEN ''fa fa-folder'' ELSE ''fa fa-file'' END';
          END IF;

          -- roots / default
          IF l_action = 'roots' OR (l_action = 'search' AND l_search IS NULL) THEN
            l_sql := 'WITH q AS ('||l_sql_query||') '||
                     'SELECT q.id, q.parent_id, q.label,'||
                     ' CASE WHEN EXISTS (SELECT 1 FROM q c WHERE c.parent_id = q.id) THEN 1 ELSE 0 END has_children,'||
                     ' CASE WHEN EXISTS (SELECT 1 FROM q c WHERE c.parent_id = q.id) THEN 0 ELSE 1 END is_leaf,'||
                     ' '||l_is_disabled_expr||' AS is_disabled,'||
                     ' '||l_icon_expr_roots||' AS icon '||
                     'FROM q WHERE q.parent_id IS NULL ORDER BY q.label';

            OPEN rc FOR l_sql;
            LOOP
              FETCH rc INTO v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn; EXIT WHEN rc%NOTFOUND;
              write_node(v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn);
            END LOOP;
            CLOSE rc;

          ELSIF l_action = 'children' THEN
            l_sql := 'WITH q AS ('||l_sql_query||') '||
                     'SELECT q.id, q.parent_id, q.label,'||
                     ' CASE WHEN EXISTS (SELECT 1 FROM q c WHERE c.parent_id = q.id) THEN 1 ELSE 0 END has_children,'||
                     ' CASE WHEN EXISTS (SELECT 1 FROM q c WHERE c.parent_id = q.id) THEN 0 ELSE 1 END is_leaf,'||
                     ' '||l_is_disabled_expr||' AS is_disabled,'||
                     ' '||l_icon_expr_child||' AS icon '||
                     'FROM q WHERE q.parent_id = :PARENT_ID ORDER BY q.label';

            OPEN rc FOR l_sql USING l_parent_id;
            LOOP
              FETCH rc INTO v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn; EXIT WHEN rc%NOTFOUND;
              write_node(v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn);
            END LOOP;
            CLOSE rc;

          ELSIF l_action = 'search' AND l_search IS NOT NULL THEN
            l_sql := 'WITH q AS ('||l_sql_query||'),'||
                     ' hits AS (SELECT id FROM q WHERE UPPER(label) LIKE ''%'' || UPPER(:SEARCH) || ''%''),'||
                     ' incl AS (SELECT DISTINCT q.id FROM q START WITH q.id IN (SELECT id FROM hits) CONNECT BY PRIOR q.parent_id = q.id)'||
                     ' SELECT q.id, q.parent_id, q.label,'||
                     ' CASE WHEN EXISTS (SELECT 1 FROM q c JOIN incl i ON i.id = c.id WHERE c.parent_id = q.id) THEN 1 ELSE 0 END has_children,'||
                     ' CASE WHEN EXISTS (SELECT 1 FROM q c JOIN incl i ON i.id = c.id WHERE c.parent_id = q.id) THEN 0 ELSE 1 END is_leaf,'||
                     ' '||l_is_disabled_expr||' AS is_disabled,'||
                     ' '||l_icon_expr_search||' AS icon '||
                     ' FROM q JOIN incl i ON i.id = q.id'||
                     ' ORDER BY q.parent_id NULLS FIRST, q.label';

            OPEN rc FOR l_sql USING l_search;
            LOOP
              FETCH rc INTO v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn; EXIT WHEN rc%NOTFOUND;
              write_node(v_id, v_parent, v_label, v_has, v_leaf, v_dis, v_icn);
            END LOOP;
            CLOSE rc;
          END IF;
        END IF; -- l_sql_query not null
      END; -- SQL_QUERY block

    END IF; -- src type switch

    apex_json.close_array; -- end array for SQL sources

  END ajax;

END xx_tree_select_pkg;
/