-- Avatar del profilo: un'icona della libreria ("lucide:<nome>") sulla tessera
-- del colore del profilo. Senza icona restano le iniziali, come prima.
ALTER TABLE profiles ADD COLUMN avatar_icon TEXT;
