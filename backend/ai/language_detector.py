import logging
import re
from typing import Dict

logger = logging.getLogger("language_detector")

# Stopwords lists for common business/financial languages
STOPWORDS: Dict[str, set] = {
    "DE": {"der", "die", "das", "und", "ist", "mit", "von", "für", "rechnung", "mwst", "datum", "betrag"},
    "FR": {"le", "la", "les", "et", "est", "avec", "de", "pour", "facture", "tva", "date", "montant"},
    "ES": {"el", "la", "los", "y", "es", "con", "de", "para", "factura", "iva", "fecha", "importe"},
    "HI": {"और", "है", "का", "की", "के", "में", "से", "को", "पर", "रसीद", "दिनांक", "योग"},
    "IT": {"il", "la", "i", "e", "è", "con", "di", "per", "fattura", "iva", "data", "importo"},
    "NL": {"de", "het", "een", "en", "is", "met", "van", "voor", "factuur", "btw", "datum", "bedrag"}
}

def detect_language(text: str) -> str:
    """
    Detects the language of the provided text.
    Supports English (EN), Hindi (HI), German (DE), French (FR), Spanish (ES), Italian (IT), Dutch (NL).
    """
    if not text or not text.strip():
        return "EN" # Default to English
        
    try:
        # 1. Quick check for Devanagari script (Hindi)
        # Unicode block for Devanagari is U+0900 to U+097F
        devanagari_count = len(re.findall(r"[\u0900-\u097F]", text))
        if devanagari_count > 10:
            logger.info("Language detected: HI (Devanagari script match)")
            return "HI"
            
        # 2. Tokenize text
        words = set(re.findall(r"\b[a-z]{2,10}\b", text.lower()))
        if not words:
            return "EN"
            
        best_lang = "EN"
        max_matches = 0
        
        for lang, stopwords_set in STOPWORDS.items():
            matches = len(words & stopwords_set)
            if matches > max_matches:
                max_matches = matches
                best_lang = lang
                
        # If we have at least 2 common stopwords matched, assign that language. Otherwise, default to English.
        if max_matches >= 2:
            logger.info(f"Language detected: {best_lang} (Stopword matches: {max_matches})")
            return best_lang
            
    except Exception as e:
        logger.error(f"Error in language_detector: {e}", exc_info=True)
        
    return "EN"
