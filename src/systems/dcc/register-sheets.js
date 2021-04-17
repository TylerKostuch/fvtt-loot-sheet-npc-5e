import LootSheet from "./loot-sheet.js";

function registerSheets() {
    Actors.registerSheet("dcc", LootSheet, {
        types: ["NPC"], // TODO: DND5e uses lowercase npc
        makeDefault: false
    });
}

export default registerSheets