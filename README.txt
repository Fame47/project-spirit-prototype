FIGHTING SPIRIT - HUNTER BOOMERANG RETURN PATCH

Built on the current Hunter spear-throw script.

INSTALL
1. Replace the project-root script.js with this script.js.
2. Keep your current index.html, style.css, and assets folders unchanged.

NEW BOOMERANG BEHAVIOR
- Hunter throws the boomerang FORWARD in the direction he is facing.
- The outbound boomerang is NOT active and has NO opponent hitbox.
- It passes through the opponent and continues forward for about 1.5 seconds.
- It then turns around from its actual position and homes back toward Hunter's CURRENT position.
- Only the RETURN trip is active and can hit the opponent.
- After one hit, it continues returning but cannot hit a second time.
- The boomerang disappears when Hunter catches it.
- Regular and red/powered boomerangs use the same flight logic.
- Powered boomerang keeps its existing higher damage, red glow, and unblockable property.
- CPU threat logic ignores the harmless outbound trip and reacts only once the boomerang returns.

Existing spear-throw animation code is preserved.
