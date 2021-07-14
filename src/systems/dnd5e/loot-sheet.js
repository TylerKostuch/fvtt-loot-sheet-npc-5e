import ActorSheet5eNPC from "../../../../../systems/dnd5e/module/actor/sheets/npc.js";
import Item5e from "../../../../../systems/dnd5e/module/item/entity.js";
import config from "../../config.js";

export default class LootSheet extends ActorSheet5eNPC {
    get template() {
        Handlebars.registerHelper("debug", function(optionalValue) {
            console.log("Current Context");
            console.log("====================");
            console.log(this);

            if (optionalValue) {
                console.log("Value");
                console.log("====================");
                console.log(optionalValue);
            }
        });

        // adding the #equals and #unequals handlebars helper
        Handlebars.registerHelper('equals', function (arg1, arg2, options) {
            return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
        });

        Handlebars.registerHelper('unequals', function (arg1, arg2, options) {
            return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
        });

        Handlebars.registerHelper('lootsheetprice', function (basePrice, modifier) {
            return (Math.round(basePrice * modifier * 100) / 100).toLocaleString('en') + " gp";
        });

        Handlebars.registerHelper('lootsheetstackweight', function (weight, qty) {
            let showStackWeight = game.settings.get("lootsheetnpc5e", "showStackWeight");
            if (showStackWeight) {
                return `/${(weight * qty).toLocaleString('en')}`;
            }
            else {
                return ""
            }

        });

        Handlebars.registerHelper('lootsheetweight', function (weight) {
            return (Math.round(weight * 1e5) / 1e5).toString();
        });

        const path = "systems/dnd5e/templates/actors/";
        if (!game.user.isGM && this.actor.limited) return path + "limited-sheet.html";
        return "modules/lootsheetnpc5e/template/npc-sheet.html";
    }

    static get defaultOptions() {
        const options = super.defaultOptions;

        mergeObject(options, {
            classes: ["dnd5e sheet actor npc npc-sheet loot-sheet-npc"],
            width: 890,
            height: 750
        });
        return options;
    }

    async getData() {
        const sheetData = super.getData();

        // Prepare GM Settings
        this._prepareGMSettings(sheetData.actor);

        // Prepare isGM attribute in sheet Data

        //console.log("game.user: ", game.user);
        if (game.user.isGM) sheetData.isGM = true;
        else sheetData.isGM = false;
        //console.log("sheetData.isGM: ", sheetData.isGM);
        console.log(this.actor);

        let lootsheettype = await this.actor.getFlag("lootsheetnpc5e", "lootsheettype");
        if (!lootsheettype) await this.actor.setFlag("lootsheetnpc5e", "lootsheettype", "Loot");
        lootsheettype = await this.actor.getFlag("lootsheetnpc5e", "lootsheettype");


        let priceModifier = 1.0;
        if (lootsheettype === "Merchant") {
            priceModifier = await this.actor.getFlag("lootsheetnpc5e", "priceModifier");
            if (!priceModifier) await this.actor.setFlag("lootsheetnpc5e", "priceModifier", 1.0);
            priceModifier = await this.actor.getFlag("lootsheetnpc5e", "priceModifier");
        }

        let totalWeight = 0;
        this.actor.data.items.forEach((item)=>totalWeight += Math.round((item.data.quantity * item.data.weight * 100) / 100));

        let totalPrice = 0;
        this.actor.data.items.forEach((item)=>totalPrice += Math.round((item.data.quantity * item.data.price * priceModifier * 100) / 100));

        let totalQuantity = 0;
        this.actor.data.items.forEach((item)=>totalQuantity += Math.round((item.data.quantity * 100) / 100));

        sheetData.lootsheettype = lootsheettype;
        sheetData.totalItems = this.actor.data.items.length;
        sheetData.totalWeight = totalWeight.toLocaleString('en');
        sheetData.totalPrice = totalPrice.toLocaleString('en') + " gp";
        sheetData.totalQuantity = totalQuantity;
        sheetData.priceModifier = priceModifier;
        sheetData.rolltables = game.tables.entities;
        sheetData.lootCurrency = game.settings.get("lootsheetnpc5e", "lootCurrency");
        sheetData.lootAll = game.settings.get("lootsheetnpc5e", "lootAll");

        // Return data for rendering
        return sheetData;
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers
    /* -------------------------------------------- */

    /**
     * Activate event listeners using the prepared sheet HTML
     * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
     */
    activateListeners(html) {
        super.activateListeners(html);
        if (this.options.editable) {
            // Toggle Permissions
            html.find('.permission-proficiency').click(ev => this._onCyclePermissionProficiency(ev));
            html.find('.permission-proficiency-bulk').click(ev => this._onCyclePermissionProficiencyBulk(ev));

            // Price Modifier
            html.find('.price-modifier').click(ev => this._priceModifier(ev));

            html.find('.merchant-settings').change(ev => this._merchantSettingChange(ev));
            html.find('.update-inventory').click(ev => this._merchantInventoryUpdate(ev));
        }

        // Split Coins
        html.find('.split-coins').removeAttr('disabled').click(ev => this._distributeCoins(ev));

        // Buy Item
        html.find('.item-buy').click(ev => this._buyItem(ev));
        html.find('.item-buyall').click(ev => this._buyItem(ev, 1));

        // Loot Item
        html.find('.item-loot').click(ev => this._lootItem(ev));
        html.find('.item-lootall').click(ev => this._lootItem(ev, 1));

        // Loot Currency
        html.find('.currency-loot').click(ev => this._lootCoins(ev));

        // Loot All
        html.find('.loot-all').removeAttr('disabled').click(ev => this._lootAll(ev, html));

        // Sheet Type
        html.find('.sheet-type').change(ev => this._changeSheetType(ev, html));

        // Roll Table
        //html.find('.sheet-type').change(ev => this._changeSheetType(ev, html));

    }

    /* -------------------------------------------- */

    /**
     * Handle merchant settings change
     * @private
     */
    async _merchantSettingChange(event, html) {
        event.preventDefault();
        console.log("Loot Sheet | Merchant settings changed");

        const moduleNamespace = "lootsheetnpc5e";
        const expectedKeys = ["rolltable", "shopQty", "itemQty", "itemQtyLimit", "clearInventory", "itemOnlyOnce"];

        let targetKey = event.target.name.split('.')[3];


        if (expectedKeys.indexOf(targetKey) === -1) {
            console.log(`Loot Sheet | Error changing stettings for "${targetKey}".`);
            return ui.notifications.error(`Error changing stettings for "${targetKey}".`);
        }

        if (targetKey == "clearInventory" || targetKey == "itemOnlyOnce") {
            console.log(targetKey + " set to " + event.target.checked);
            await this.actor.setFlag(moduleNamespace, targetKey, event.target.checked);
        } else if (event.target.value) {
            console.log(targetKey + " set to " + event.target.value);
            console.log("A");
            await this.actor.setFlag(moduleNamespace, targetKey, event.target.value);
        } else {
            console.log(targetKey + " set to " + event.target.value);
            console.log("B");
            await this.actor.unsetFlag(moduleNamespace, targetKey, event.target.value);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle merchant inventory update
     * @private
     */
    async _merchantInventoryUpdate(event, html) {
        event.preventDefault();

        const moduleNamespace = "lootsheetnpc5e";
        const rolltableName = this.actor.getFlag(moduleNamespace, "rolltable");
        const shopQtyFormula = this.actor.getFlag(moduleNamespace, "shopQty") || "1";
        const itemQtyFormula = this.actor.getFlag(moduleNamespace, "itemQty") || "1";
        const itemQtyLimit = this.actor.getFlag(moduleNamespace, "itemQtyLimit") || "0";
        const clearInventory = this.actor.getFlag(moduleNamespace, "clearInventory");
        const itemOnlyOnce = this.actor.getFlag(moduleNamespace, "itemOnlyOnce");
        const reducedVerbosity = game.settings.get("lootsheetnpc5e", "reduceUpdateVerbosity");

        let shopQtyRoll = new Roll(shopQtyFormula);
        shopQtyRoll.roll();

        let rolltable = game.tables.getName(rolltableName);
        if (!rolltable) {
            // console.log(`Loot Sheet | No Rollable Table found with name "${rolltableName}".`);
            return ui.notifications.error(`No Rollable Table found with name "${rolltableName}".`);
        }

        if (itemOnlyOnce) {
            if (rolltable.results.length < shopQtyRoll.total)  {
                return ui.notifications.error(`Cannot create a merchant with ${shopQtyRoll.total} unqiue entries if the rolltable only contains ${rolltable.results.length} items`);
            }
        }

        // console.log(rolltable);

        if (clearInventory) {

            let currentItems = this.actor.data.items.map(i => i._id);
            await this.actor.deleteEmbeddedEntity("OwnedItem", currentItems);
            // console.log(currentItems);
        }

        console.log(`Loot Sheet | Adding ${shopQtyRoll.result} new items`);

        if (!itemOnlyOnce) {
            for (let i = 0; i < shopQtyRoll.total; i++) {
                const rollResult = rolltable.roll();
                //console.log(rollResult);
                let newItem = null;

                if (rollResult.results[0].collection === "Item") {
                    newItem = game.items.get(rollResult.results[0].resultId);
                }
                else {
                    // Try to find it in the compendium
                    const items = game.packs.get(rollResult.results[0].collection);
                    // console.log(items);
                    // dnd5eitems.getIndex().then(index => console.log(index));
                    // let newItem = dnd5eitems.index.find(e => e.id === rollResult.results[0].resultId);
                    // items.getEntity(rollResult.results[0].resultId).then(i => console.log(i));
                    newItem = await items.getEntity(rollResult.results[0].resultId);
                }
                if (!newItem || newItem === null) {
                    // console.log(`Loot Sheet | No item found "${rollResult.results[0].resultId}".`);
                    return ui.notifications.error(`No item found "${rollResult.results[0].resultId}".`);
                }

                if (newItem.type === "spell") {
                    newItem = await Item5e.createScrollFromSpell(newItem)
                }

                let itemQtyRoll = new Roll(itemQtyFormula);
                itemQtyRoll.roll();
                console.log(`Loot Sheet | Adding ${itemQtyRoll.total} x ${newItem.name}`)

                // newItem.data.quantity = itemQtyRoll.result;

                let existingItem = this.actor.items.find(item => item.data.name == newItem.name);

                if (existingItem === null) {
                    await this.actor.createEmbeddedEntity("OwnedItem", newItem);
                    console.log(`Loot Sheet | ${newItem.name} does not exist.`);
                    existingItem = this.actor.items.find(item => item.data.name == newItem.name);

                    if (itemQtyLimit > 0 && Number(itemQtyLimit) < Number(itemQtyRoll.total)) {
                        await existingItem.update({ "data.quantity": itemQtyLimit });
                        if (!reducedVerbosity) ui.notifications.info(`Added new ${itemQtyLimit} x ${newItem.name}.`);
                    } else {
                        await existingItem.update({ "data.quantity": itemQtyRoll.total });
                        if (!reducedVerbosity) ui.notifications.info(`Added new ${itemQtyRoll.total} x ${newItem.name}.`);
                    }
                }
                else {
                    console.log(`Loot Sheet | Item ${newItem.name} exists.`);

                    let newQty = Number(existingItem.data.data.quantity) + Number(itemQtyRoll.total);

                    if (itemQtyLimit > 0 && Number(itemQtyLimit) === Number(existingItem.data.data.quantity)) {
                        if (!reducedVerbosity) ui.notifications.info(`${newItem.name} already at maximum quantity (${itemQtyLimit}).`);
                    }
                    else if (itemQtyLimit > 0 && Number(itemQtyLimit) < Number(newQty)) {
                        //console.log("Exceeds existing quantity, limiting");
                        await existingItem.update({ "data.quantity": itemQtyLimit });
                        if (!reducedVerbosity) ui.notifications.info(`Added additional quantity to ${newItem.name} to the specified maximum of ${itemQtyLimit}.`);
                    } else {
                        await existingItem.update({ "data.quantity": newQty });
                        if (!reducedVerbosity) ui.notifications.info(`Added additional ${itemQtyRoll.total} quantity to ${newItem.name}.`);
                    }
                }
            }
        }
        else {
            // Get a list which contains indexes of all possible results

            const rolltableIndexes = []

            // Add one entry for each weight an item has
            for (let index in [...Array(rolltable.results.length).keys()]) {
                let numberOfEntries = rolltable.data.results[index].weight
                for (let i = 0; i < numberOfEntries; i++) {
                    rolltableIndexes.push(index);
                }
            }

            // Shuffle the list of indexes
            var currentIndex = rolltableIndexes.length, temporaryValue, randomIndex;

            // While there remain elements to shuffle...
            while (0 !== currentIndex) {

                // Pick a remaining element...
                randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex -= 1;

                // And swap it with the current element.
                temporaryValue = rolltableIndexes[currentIndex];
                rolltableIndexes[currentIndex] = rolltableIndexes[randomIndex];
                rolltableIndexes[randomIndex] = temporaryValue;
            }

            // console.log(`Rollables: ${rolltableIndexes}`)

            let indexesToUse = [];
            let numberOfAdditionalItems = 0;
            // Get the first N entries from our shuffled list. Those are the indexes of the items in the roll table we want to add
            // But because we added multiple entries per index to account for weighting, we need to increase our list length until we got enough unique items
            while (true)
            {
                let usedEntries = rolltableIndexes.slice(0, shopQtyRoll.total + numberOfAdditionalItems);
                // console.log(`Distinct: ${usedEntries}`);
                let distinctEntris = [...new Set(usedEntries)];

                if (distinctEntris.length < shopQtyRoll.total) {
                    numberOfAdditionalItems++;
                    // console.log(`numberOfAdditionalItems: ${numberOfAdditionalItems}`);
                    continue;
                }

                indexesToUse = distinctEntris
                // console.log(`indexesToUse: ${indexesToUse}`)
                break;
            }

            for (const index of indexesToUse)
            {
                let itemQtyRoll = new Roll(itemQtyFormula);
                itemQtyRoll.roll();

                let newItem = null

                if (rolltable.results[index].collection === "Item") {
                    newItem = game.items.get(rolltable.results[index].resultId);
                }
                else {
                    //Try to find it in the compendium
                    const items = game.packs.get(rolltable.results[index].collection);
                    newItem = await items.getEntity(rolltable.results[index].resultId);
                }
                if (!newItem || newItem === null) {
                    return ui.notifications.error(`No item found "${rolltable.results[index].resultId}".`);
                }

                if (newItem.type === "spell") {
                    newItem = await Item5e.createScrollFromSpell(newItem)
                }

                await this.actor.createEmbeddedEntity("OwnedItem", newItem);
                let existingItem = this.actor.items.find(item => item.data.name == newItem.name);

                if (itemQtyLimit > 0 && Number(itemQtyLimit) < Number(itemQtyRoll.total)) {
                    await existingItem.update({ "data.quantity": itemQtyLimit });
                    if (!reducedVerbosity) ui.notifications.info(`Added new ${itemQtyLimit} x ${newItem.name}.`);
                } else {
                    await existingItem.update({ "data.quantity": itemQtyRoll.total });
                    if (!reducedVerbosity) ui.notifications.info(`Added new ${itemQtyRoll.total} x ${newItem.name}.`);
                }
            }
        }
    }

    _createRollTable() {

        let type = "weapon";

        game.packs.map(p => p.collection);

        const pack = game.packs.find(p => p.collection === "dnd.items");

        let i = 0;

        let output = [];

        pack.getIndex().then(index => index.forEach(function (arrayItem) {
            var x = arrayItem._id;
            //console.log(arrayItem);
            i++;
            pack.getEntity(arrayItem._id).then(packItem => {

                if (packItem.type === type) {

                    //console.log(packItem);

                    let newItem = {
                        "_id": packItem._id,
                        "flags": {},
                        "type": 1,
                        "text": packItem.name,
                        "img": packItem.img,
                        "collection": "Item",
                        "resultId": packItem._id,
                        "weight": 1,
                        "range": [
                            i,
                            i
                        ],
                        "drawn": false
                    };

                    output.push(newItem);

                }
            });
        }));

        console.log(output);
        return;
    }

    /* -------------------------------------------- */

    /**
     * Handle sheet type change
     * @private
     */
    async _changeSheetType(event, html) {
        event.preventDefault();
        console.log("Loot Sheet | Sheet Type changed", event);

        let currentActor = this.actor;

        let selectedIndex = event.target.selectedIndex;

        let selectedItem = event.target[selectedIndex].value;

        await currentActor.setFlag("lootsheetnpc5e", "lootsheettype", selectedItem);

    }

    /* -------------------------------------------- */

    /**
     * Handle buy item
     * @private
     */
    _buyItem(event, all = 0) {
        event.preventDefault();
        console.log("Loot Sheet | Buy Item clicked");

        let targetGm = null;
        game.users.forEach((u) => {
            if (u.isGM && u.active && u.viewedScene === game.user.viewedScene) {
                targetGm = u;
            }
        });

        if (!targetGm) {
            return ui.notifications.error("No active GM on your scene, they must be online and on the same scene to purchase an item.");
        }

        if (this.token === null) {
            return ui.notifications.error(`You must purchase items from a token.`);
        }
        if (!game.user.actorId) {
            console.log("Loot Sheet | No active character for user");
            return ui.notifications.error(`No active character for user.`);
        }

        let itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
        const item = this.actor.getEmbeddedEntity("OwnedItem", itemId);

        const packet = {
            type: "buy",
            buyerId: game.user.actorId,
            tokenId: this.token.id,
            itemId: itemId,
            quantity: 1,
            processorId: targetGm.id
        };

        if (all || event.shiftKey) {
            packet.quantity = item.data.quantity;
        }

        if (item.data.quantity === packet.quantity) {
            console.log("LootSheet5e", "Sending buy request to " + targetGm.name, packet);
            game.socket.emit(config.SOCKET, packet);
            return;
        }

        let d = new QuantityDialog((quantity) => {
                packet.quantity = quantity;
                console.log("LootSheet5e", "Sending buy request to " + targetGm.name, packet);
                game.socket.emit(config.SOCKET, packet);
            },
            {
                acceptLabel: "Purchase"
            }
        );
        d.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle Loot item
     * @private
     */
    _lootItem(event, all = 0) {
        event.preventDefault();
        console.log("Loot Sheet | Loot Item clicked");

        let targetGm = null;
        game.users.forEach((u) => {
            if (u.isGM && u.active && u.viewedScene === game.user.viewedScene) {
                targetGm = u;
            }
        });

        if (!targetGm) {
            return ui.notifications.error("No active GM on your scene, they must be online and on the same scene to purchase an item.");
        }

        if (this.token === null) {
            return ui.notifications.error(`You must loot items from a token.`);
        }
        if (!game.user.actorId) {
            console.log("Loot Sheet | No active character for user");
            return ui.notifications.error(`No active character for user.`);
        }

        const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
        const targetItem = this.actor.getEmbeddedEntity("OwnedItem", itemId);

        const item = { itemId: itemId, quantity: 1 };
        if (all || event.shiftKey) {
            item.quantity = targetItem.data.quantity;
        }

        const packet = {
            type: "loot",
            looterId: game.user.actorId,
            tokenId: this.token.id,
            items: [item],
            processorId: targetGm.id
        };

        if (targetItem.data.quantity === item.quantity) {
            console.log("LootSheet5e", "Sending loot request to " + targetGm.name, packet);
            game.socket.emit(config.SOCKET, packet);
            return;
        }

        const d = new QuantityDialog((quantity) => {
                packet.items[0]['quantity'] = quantity;
                console.log("LootSheet5e", "Sending loot request to " + targetGm.name, packet);
                game.socket.emit(config.SOCKET, packet);
            },
            {
                acceptLabel: "Loot"
            }
        );
        d.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle Loot coins
     * @private
     */
    _lootCoins(event) {
        event.preventDefault();
        if (!game.settings.get("lootsheetnpc5e", "lootCurrency")) {
            return;
        }
        console.log("Loot Sheet | Loot Coins clicked");

        let targetGm = null;
        game.users.forEach((u) => {
            if (u.isGM && u.active && u.viewedScene === game.user.viewedScene) {
                targetGm = u;
            }
        });

        if (!targetGm) {
            return ui.notifications.error("No active GM on your scene, they must be online and on the same scene to loot coins.");
        }

        if (this.token === null) {
            return ui.notifications.error(`You must loot coins from a token.`);
        }
        if (!game.user.actorId) {
            console.log("Loot Sheet | No active character for user");
            return ui.notifications.error(`No active character for user.`);
        }

        const packet = {
            type: "lootCoins",
            looterId: game.user.actorId,
            tokenId: this.token.id,
            processorId: targetGm.id
        };
        console.log("LootSheet5e", "Sending loot request to " + targetGm.name, packet);
        game.socket.emit(config.SOCKET, packet);
    }

    /* -------------------------------------------- */

    /**
     * Handle Loot all
     * @private
     */
    _lootAll(event, html) {
        event.preventDefault();
        console.log("Loot Sheet | Loot All clicked");
        this._lootCoins(event);

        let targetGm = null;
        game.users.forEach((u) => {
            if (u.isGM && u.active && u.viewedScene === game.user.viewedScene) {
                targetGm = u;
            }
        });

        if (!targetGm) {
            return ui.notifications.error("No active GM on your scene, they must be online and on the same scene to purchase an item.");
        }

        if (this.token === null) {
            return ui.notifications.error(`You must loot items from a token.`);
        }
        if (!game.user.actorId) {
            console.log("Loot Sheet | No active character for user");
            return ui.notifications.error(`No active character for user.`);
        }

        const itemTargets = html.find('.item[data-item-id]');
        if (!itemTargets) {
            return;
        }

        const items = [];
        for (let i of itemTargets) {
            const itemId = i.getAttribute("data-item-id");
            const item = this.actor.getEmbeddedEntity("OwnedItem", itemId);
            items.push({ itemId: itemId, quantity: item.data.quantity });
        }
        if (items.length === 0) {
            return;
        }

        const packet = {
            type: "loot",
            looterId: game.user.actorId,
            tokenId: this.token.id,
            items: items,
            processorId: targetGm.id
        };

        console.log("LootSheet5e", "Sending loot request to " + targetGm.name, packet);
        game.socket.emit(config.SOCKET, packet);
    }

    /* -------------------------------------------- */

    /**
     * Handle price modifier
     * @private
     */
    async _priceModifier(event) {
        event.preventDefault();
        //console.log("Loot Sheet | Price Modifier clicked");
        //console.log(this.actor.isToken);

        let priceModifier = await this.actor.getFlag("lootsheetnpc5e", "priceModifier");
        if (!priceModifier) priceModifier = 1.0;

        priceModifier = Math.round(priceModifier * 100);

        var html = "<p>Use this slider to increase or decrease the price of all items in this inventory. <i class='fa fa-question-circle' title='This uses a percentage factor where 100% is the current price, 0% is 0, and 200% is double the price.'></i></p>";
        html += '<p><input name="price-modifier-percent" id="price-modifier-percent" type="range" min="0" max="200" value="' + priceModifier + '" class="slider"></p>';
        html += '<p><label>Percentage:</label> <input type=number min="0" max="200" value="' + priceModifier + '" id="price-modifier-percent-display"></p>';
        html += '<script>var pmSlider = document.getElementById("price-modifier-percent"); var pmDisplay = document.getElementById("price-modifier-percent-display"); pmDisplay.value = pmSlider.value; pmSlider.oninput = function() { pmDisplay.value = this.value; }; pmDisplay.oninput = function() { pmSlider.value = this.value; };</script>';

        let d = new Dialog({
            title: "Price Modifier",
            content: html,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Update",
                    callback: () => this.actor.setFlag("lootsheetnpc5e", "priceModifier", document.getElementById("price-modifier-percent").value / 100)
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => console.log("Loot Sheet | Price Modifier Cancelled")
                }
            },
            default: "two",
            close: () => console.log("Loot Sheet | Price Modifier Closed")
        });
        d.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle distribution of coins
     * @private
     */
    _distributeCoins(event) {
        event.preventDefault();
        //console.log("Loot Sheet | Split Coins clicked");

        let targetGm = null;
        game.users.forEach((u) => {
            if (u.isGM && u.active && u.viewedScene === game.user.viewedScene) {
                targetGm = u;
            }
        });

        if (!targetGm) {
            return ui.notifications.error("No active GM on your scene, they must be online and on the same scene to purchase an item.");
        }

        if (this.token === null) {
            return ui.notifications.error(`You must loot items from a token.`);
        }

        if (game.user.isGM) {
            //don't use socket
            let container = canvas.tokens.get(this.token.id);
            this._hackydistributeCoins(container.actor);
            return;
        }

        const packet = {
            type: "distributeCoins",
            looterId: game.user.actorId,
            tokenId: this.token.id,
            processorId: targetGm.id
        };
        console.log("LootSheet5e", "Sending distribute coins request to " + targetGm.name, packet);
        game.socket.emit(config.SOCKET, packet);
    }

    _hackydistributeCoins(containerActor) {
        //This is identical as the distributeCoins function defined in the init hook which for some reason can't be called from the above _distributeCoins method of the LootSheetNPC5E class. I couldn't be bothered to figure out why a socket can't be called as the GM... so this is a hack but it works.
        let actorData = containerActor.data
        let observers = [];
        let players = game.users.players;

        //console.log("Loot Sheet | actorData", actorData);
        // Calculate observers
        for (let player of players) {
            let playerPermission = LootSheet5eNPCHelper.getLootPermissionForPlayer(actorData, player);
            if (player != "default" && playerPermission >= 2) {
                //console.log("Loot Sheet | player", player);
                let actor = game.actors.get(player.data.character);
                //console.log("Loot Sheet | actor", actor);
                if (actor !== null && (player.data.role === 1 || player.data.role === 2)) observers.push(actor);
            }
        }

        //console.log("Loot Sheet | observers", observers);
        if (observers.length === 0) return;

        // Calculate split of currency
        let currencySplit = duplicate(actorData.data.currency);
        //console.log("Loot Sheet | Currency data", currencySplit);

        // keep track of the remainder
        let currencyRemainder = {};

        for (let c in currencySplit) {
            if (observers.length) {
                // calculate remainder
                currencyRemainder[c] = (currencySplit[c].value % observers.length);
                //console.log("Remainder: " + currencyRemainder[c]);

                currencySplit[c].value = Math.floor(currencySplit[c].value / observers.length);
            }
            else currencySplit[c].value = 0;
        }

        // add currency to actors existing coins
        let msg = [];
        for (let u of observers) {
            //console.log("Loot Sheet | u of observers", u);
            if (u === null) continue;

            msg = [];
            let currency = u.data.data.currency,
                newCurrency = duplicate(u.data.data.currency);

            //console.log("Loot Sheet | Current Currency", currency);

            for (let c in currency) {
                // add msg for chat description
                if (currencySplit[c].value) {
                    //console.log("Loot Sheet | New currency for " + c, currencySplit[c]);
                    msg.push(` ${currencySplit[c].value} ${c} coins`)
                }
                if (currencySplit[c].value != null) {
                    // Add currency to permitted actor
                    newCurrency[c] = parseInt(currency[c] || 0) + currencySplit[c].value;
                    u.update({
                        'data.currency': newCurrency
                    });
                }
            }

            // Remove currency from loot actor.
            let lootCurrency = containerActor.data.data.currency,
                zeroCurrency = {};

            for (let c in lootCurrency) {
                zeroCurrency[c] = {
                    'type': currencySplit[c].type,
                    'label': currencySplit[c].type,
                    'value': currencyRemainder[c]
                }
                containerActor.update({
                    "data.currency": zeroCurrency
                });
            }

            // Create chat message for coins received
            if (msg.length != 0) {
                let message = `${u.data.name} receives: `;
                message += msg.join(",");
                ChatMessage.create({
                    user: game.user._id,
                    speaker: {
                        actor: containerActor,
                        alias: containerActor.name
                    },
                    content: message
                });
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle cycling permissions
     * @private
     */
    _onCyclePermissionProficiency(event) {

        event.preventDefault();

        //console.log("Loot Sheet | this.actor.data.permission", this.actor.data.permission);


        let actorData = this.actor.data;


        let field = $(event.currentTarget).siblings('input[type="hidden"]');

        let level = parseFloat(field.val());
        if (typeof level === undefined) level = 0;

        //console.log("Loot Sheet | current level " + level);

        const levels = [0, 3, 2]; //const levels = [0, 2, 3];

        let idx = levels.indexOf(level),
            newLevel = levels[(idx === levels.length - 1) ? 0 : idx + 1];

        //console.log("Loot Sheet | new level " + newLevel);

        let playerId = field[0].name;

        //console.log("Loot Sheet | Current actor: " + playerId);

        this._updatePermissions(actorData, playerId, newLevel, event);

        this._onSubmit(event);
    }

    /* -------------------------------------------- */

    /**
     * Handle cycling bulk permissions
     * @private
     */
    _onCyclePermissionProficiencyBulk(event) {
        event.preventDefault();

        let actorData = this.actor.data;

        let field = $(event.currentTarget).parent().siblings('input[type="hidden"]');
        let level = parseFloat(field.val());
        if (typeof level === undefined || level === 999) level = 0;

        const levels = [0, 3, 2]; //const levels = [0, 2, 3];

        let idx = levels.indexOf(level),
            newLevel = levels[(idx === levels.length - 1) ? 0 : idx + 1];

        let users = game.users.entities;

        let currentPermissions = duplicate(actorData.permission);
        for (let u of users) {
            if (u.data.role === 1 || u.data.role === 2) {
                currentPermissions[u._id] = newLevel;
            }
        }
        const lootPermissions = new PermissionControl(this.actor);
        lootPermissions._updateObject(event, currentPermissions)

        this._onSubmit(event);
    }

    _updatePermissions(actorData, playerId, newLevel, event) {
        // Read player permission on this actor and adjust to new level
        let currentPermissions = duplicate(actorData.permission);
        currentPermissions[playerId] = newLevel;
        // Save updated player permissions
        const lootPermissions = new PermissionControl(this.actor);
        lootPermissions._updateObject(event, currentPermissions);
    }

    /* -------------------------------------------- */

    /**
     * Organize and classify Items for Loot NPC sheets
     * @private
     */
    _prepareItems(actorData) {

        //console.log("Loot Sheet | Prepare Features");
        // Actions
        const features = {
            weapons: {
                label: "Weapons",
                items: [],
                type: "weapon"
            },
            equipment: {
                label: "Equipment",
                items: [],
                type: "equipment"
            },
            consumables: {
                label: "Consumables",
                items: [],
                type: "consumable"
            },
            tools: {
                label: "Tools",
                items: [],
                type: "tool"
            },
            containers: {
                label: "Containers",
                items: [],
                type: "container"
            },
            loot: {
                label: "Loot",
                items: [],
                type: "loot"
            },

        };

        //console.log("Loot Sheet | Prepare Items");
        // Iterate through items, allocating to containers
        let items = actorData.items;
        items = items.sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
        for (let i of items) {
            i.img = i.img || DEFAULT_TOKEN;
            //console.log("Loot Sheet | item", i);

            // Features
            if (i.type === "weapon") features.weapons.items.push(i);
            else if (i.type === "equipment") features.equipment.items.push(i);
            else if (i.type === "consumable") features.consumables.items.push(i);
            else if (i.type === "tool") features.tools.items.push(i);
            else if (["container", "backpack"].includes(i.type)) features.containers.items.push(i);
            else if (i.type === "loot") features.loot.items.push(i);
            else features.loot.items.push(i);
        }

        // Assign and return
        //actorData.features = features;
        actorData.actor.features = features;
        //console.log(this.actor);
    }

    /* -------------------------------------------- */


    /**
     * Get the font-awesome icon used to display the permission level.
     * @private
     */
    _getPermissionIcon(level) {
        const icons = {
            0: '<i class="far fa-circle"></i>',
            2: '<i class="fas fa-eye"></i>',
            3: '<i class="fas fa-check"></i>',
            999: '<i class="fas fa-users"></i>'
        };
        return icons[level];
    }

    /* -------------------------------------------- */

    /**
     * Get the font-awesome icon used to display the permission level.
     * @private
     */
    _getPermissionDescription(level) {
        const description = {
            0: "None (cannot access sheet)",
            2: "Observer (access to sheet but can only purchase items if merchant sheet type)",
            3: "Owner (can access items and share coins)",
            999: "Change all permissions"
        };
        return description[level];
    }


    /* -------------------------------------------- */

    /**
     * Prepares GM settings to be rendered by the loot sheet.
     * @private
     */
    _prepareGMSettings(actorData) {
        const playerData = [],
            observers = [];

        let players = game.users.players;
        let commonPlayersPermission = -1;

        //console.log("Loot Sheet _prepareGMSettings | actorData.permission", actorData.permission);

        for (let player of players)
        {
            //console.log("Loot Sheet | Checking user " + player.data.name, player);

            // get the name of the primary actor for a player
            const actor = game.actors.get(player.data.character);
            //console.log("Loot Sheet | Checking actor", actor);

            if (actor) {
                player.actor = actor.data.name;
                player.actorId = actor.data._id;
                player.playerId = player.data._id;

                player.lootPermission = LootSheet5eNPCHelper.getLootPermissionForPlayer(actorData, player);

                if (player.lootPermission >= 2 && !observers.includes(actor.data._id))
                {
                    observers.push(actor.data._id);
                }

                //Set icons and permission texts for html
                //console.log("Loot Sheet | lootPermission", player.lootPermission);
                if (commonPlayersPermission < 0) {
                    commonPlayersPermission = player.lootPermission;
                } else if (commonPlayersPermission !== player.lootPermission) {
                    commonPlayersPermission = 999;
                }

                player.icon = this._getPermissionIcon(player.lootPermission);
                player.lootPermissionDescription = this._getPermissionDescription(player.lootPermission);
                playerData.push(player);
            }
        }

        // calculate the split of coins between all observers of the sheet.
        let currencySplit = duplicate(actorData.data.currency);
        for (let c in currencySplit) {
            if (observers.length)
                if (currencySplit[c] != null) currencySplit[c].value = Math.floor(currencySplit[c].value / observers.length);
                else
                    currencySplit[c] = 0
        }

        let loot = {}
        loot.players = playerData;
        loot.observerCount = observers.length;
        loot.currency = currencySplit;
        loot.playersPermission = commonPlayersPermission;
        loot.playersPermissionIcon = this._getPermissionIcon(commonPlayersPermission);
        loot.playersPermissionDescription = this._getPermissionDescription(commonPlayersPermission);
        actorData.flags.loot = loot;
    }
}