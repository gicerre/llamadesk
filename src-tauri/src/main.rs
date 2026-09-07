// Su Windows in release non deve comparire la console: e' un'app desktop.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    llamadesk_lib::run()
}
