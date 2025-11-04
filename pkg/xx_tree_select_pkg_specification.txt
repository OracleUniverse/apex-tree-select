create or replace package xx_tree_select_pkg as
  /**
   * Oracle APEX Tree View with Checkboxes Plugin
   * Backend logic for rendering the component and handling AJAX data requests.
   */

  /**
   * Renders the initial HTML structure of the plugin region.
   */
  procedure render (
    p_plugin in            apex_plugin.t_plugin,
    p_region in            apex_plugin.t_region,
    p_param  in            apex_plugin.t_region_render_param,
    p_result in out nocopy apex_plugin.t_region_render_result
  );

  /**
   * Handles AJAX callbacks from the client-side JavaScript to fetch tree data.
   * Actions: roots, children, children_batch, search.
   */
  procedure ajax (
    p_plugin in            apex_plugin.t_plugin,
    p_region in            apex_plugin.t_region,
    p_param  in            apex_plugin.t_region_ajax_param,
    p_result in out nocopy apex_plugin.t_region_ajax_result
  );

end xx_tree_select_pkg;
/