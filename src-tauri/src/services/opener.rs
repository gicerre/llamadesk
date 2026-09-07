//! Apertura degli URL nel browser predefinito del sistema.
//!
//! LlamaDesk non incorpora mai una webview per i contenuti dell'utente: ogni
//! link viene consegnato all'OS, che lo apre in una scheda del browser
//! predefinito. Cosi' le sessioni, le estensioni e i profili del browser
//! restano quelli dell'utente.

use anyhow::{anyhow, Result};
use url::Url;

/// Schemi ammessi. Tutto il resto (file:, javascript:, custom protocol...) e'
/// rifiutato: un URL malevolo salvato per errore non deve poter eseguire nulla.
const ALLOWED_SCHEMES: [&str; 3] = ["http", "https", "mailto"];

pub fn validate(raw: &str) -> Result<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("URL vuoto"));
    }

    let parsed = Url::parse(trimmed).map_err(|error| anyhow!("URL non valido: {error}"))?;

    if !ALLOWED_SCHEMES.contains(&parsed.scheme()) {
        return Err(anyhow!(
            "schema '{}' non consentito: sono ammessi solo http, https e mailto",
            parsed.scheme()
        ));
    }

    Ok(parsed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_ordinary_web_urls() {
        assert!(validate("https://example.com/path?query=1").is_ok());
        assert!(validate("http://localhost:8080").is_ok());
        assert!(validate("mailto:someone@example.com").is_ok());
        assert!(validate("  https://example.com  ").is_ok());
    }

    #[test]
    fn rejects_dangerous_schemes() {
        for url in [
            "javascript:alert(1)",
            "file:///C:/Windows/System32/cmd.exe",
            "data:text/html,<script>alert(1)</script>",
            "vbscript:msgbox",
        ] {
            assert!(validate(url).is_err(), "avrebbe dovuto rifiutare {url}");
        }
    }

    #[test]
    fn rejects_malformed_input() {
        assert!(validate("").is_err());
        assert!(validate("   ").is_err());
        assert!(validate("non un url").is_err());
    }
}
