import getLootPermissionForPlayer from "./utils/get-loot-permission-for-player.js";

// todo: Dynamically load system specific files
// game.data.system.id
import registerSheets from "./systems/dcc/register-sheets.js";
import config from "./config.js";
import CurrencyHelper from "./systems/dcc/currency-helper.js";

registerSheets()

Hooks.once("init", () => {
    Handlebars.registerHelper('equals', function (arg1, arg2, options) {
        return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('unequals', function (arg1, arg2, options) {
        return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('lootsheetstackweight', function (weight, qty) {
        let showStackWeight = game.settings.get("fvtt-loot-sheet-npc-dcc", "showStackWeight");
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

    Handlebars.registerHelper('ifeq', function (a, b, options) {
        if (a == b) { return options.fn(this); }
        return options.inverse(this);
    });

    Handlebars.registerHelper('lootsheetprice', function (basePrice, modifier) {
        const modifiedPrice = CurrencyHelper.multiply(basePrice, modifier)
        return CurrencyHelper.convertCurrenciesToString(modifiedPrice)
    });

    game.settings.register("fvtt-loot-sheet-npc-dcc", "convertCurrency", {
        name: "Convert currency after purchases?",
        hint: "If enabled, all currency will be converted to the highest denomination possible after a purchase. If disabled, currency will subtracted simply.",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register("fvtt-loot-sheet-npc-dcc", "buyChat", {
        name: "Display chat message for purchases?",
        hint: "If enabled, a chat message will display purchases of items from the loot sheet.",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });

    game.settings.register("fvtt-loot-sheet-npc-dcc", "lootCurrency", {
        name: "Loot currency?",
        hint: "If enabled, players will have the option to loot all currency to their character, in addition to splitting the currency between players.",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });

    game.settings.register("fvtt-loot-sheet-npc-dcc", "lootAll", {
        name: "Loot all?",
        hint: "If enabled, players will have the option to loot all items to their character, currency will follow the 'Loot Currency?' setting upon Loot All.",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });

    game.settings.register("fvtt-loot-sheet-npc-dcc", "showStackWeight", {
        name: "Show Stack Weight?",
        hint: "If enabled, shows the weight of the entire stack next to the item weight",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });

    game.settings.register("fvtt-loot-sheet-npc-dcc", "reduceUpdateVerbosity", {
        name: "Reduce Update Shop Verbosity",
        hint: "If enabled, no notifications will be created every time an item is added to the shop.",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });

    function chatMessage(speaker, owner, message, item) {
        if (game.settings.get("fvtt-loot-sheet-npc-dcc", "buyChat")) {
            message = `
            <div class="dnd5e chat-card item-card" data-actor-id="${owner._id}" data-item-id="${item._id}">
                <header class="card-header flexrow">
                    <img src="${item.img}" title="${item.name}" width="36" height="36">
                    <h3 class="item-name">${item.name}</h3>
                </header>

                <div class="message-content">
                    <p>` + message + `</p>
                </div>
            </div>
            `;
            ChatMessage.create({
                user: game.user._id,
                speaker: {
                    actor: speaker,
                    alias: speaker.name
                },
                content: message
            });
        }
    }

    function errorMessageToActor(target, message) {
        game.socket.emit(config.SOCKET, {
            type: "error",
            targetId: target.id,
            message: message
        });
    }

    async function moveItems(source, destination, items) {
        const updates = [];
        const deletes = [];
        const additions = [];
        const destUpdates = [];
        const results = [];
        for (let i of items) {
            let itemId = i.itemId;
            let quantity = i.quantity;
            let item = source.getEmbeddedEntity("OwnedItem", itemId);

            // Move all items if we select more than the quantity.
            if (item.data.quantity < quantity) {
                quantity = item.data.quantity;
            }

            let newItem = duplicate(item);
            const update = { _id: itemId, "data.quantity": item.data.quantity - quantity };

            if (update["data.quantity"] === 0) {
                deletes.push(itemId);
            }
            else {
                updates.push(update);
            }

            newItem.data.quantity = quantity;
            results.push({
                item: newItem,
                quantity: quantity
            });
            let destItem = destination.data.items.find(i => i.name == newItem.name);
            if (destItem === undefined) {
                additions.push(newItem);
            } else {
                //console.log("Existing Item");
                destItem.data.quantity = Number(destItem.data.quantity) + Number(newItem.data.quantity);
                destUpdates.push(destItem);
            }
        }

        if (deletes.length > 0) {
            await source.deleteEmbeddedEntity("OwnedItem", deletes);
        }

        if (updates.length > 0) {
            await source.updateEmbeddedEntity("OwnedItem", updates);
        }

        if (additions.length > 0) {
            await destination.createEmbeddedEntity("OwnedItem", additions);
        }

        if (destUpdates.length > 0) {
            await destination.updateEmbeddedEntity("OwnedItem", destUpdates);
        }

        return results;
    }

    async function lootItems(container, looter, items) {
        let moved = await moveItems(container, looter, items);

        for (let m of moved) {
            chatMessage(
                container, looter,
                `${looter.name} looted ${m.quantity} x ${m.item.name}.`,
                m.item);
        }
    }

    async function transaction(seller, buyer, itemId, quantity) {
        let sellItem = seller.getEmbeddedEntity("OwnedItem", itemId);

        // If the buyer attempts to buy more then what's in stock, buy all the stock.
        if (sellItem.data.quantity < quantity) {
            quantity = sellItem.data.quantity;
        }

        // On negative quantity we show an error
        if (quantity < 0) {
            errorMessageToActor(buyer, `Can not buy negative amounts of items.`);
            return;
        }

        // On 0 quantity skip everything to avoid error down the line
        if (quantity == 0) {
            return;
        }

        let sellerModifier = seller.getFlag("fvtt-loot-sheet-npc-dcc", "priceModifier");
        if (!sellerModifier) sellerModifier = 1.0;

        let itemCostInGold = Math.round(sellItem.data.price * sellerModifier * 100) / 100;
        
        itemCostInGold *= quantity;
        // console.log(`ItemCost: ${itemCostInGold}`)
        let buyerFunds = duplicate(buyer.data.data.currency);

        console.log(`Funds before purchase: ${buyerFunds}`);

        const conversionRates = { 
            "pp": 1,
            "gp": CONFIG.DND5E.currencyConversion.gp.each, 
            "ep": CONFIG.DND5E.currencyConversion.ep.each,
            "sp": CONFIG.DND5E.currencyConversion.sp.each,
            "cp": CONFIG.DND5E.currencyConversion.cp.each
        };

        const compensationCurrency = {"pp": "gp", "gp": "ep", "ep": "sp", "sp": "cp"};
       
        let itemCostInPlatinum = itemCostInGold / conversionRates["gp"]
        // console.log(`itemCostInGold : ${itemCostInGold}`);
        // console.log(`itemCostInPlatinum : ${itemCostInPlatinum}`);
        // console.log(`conversionRates["gp"] : ${conversionRates["gp"]}`);
        // console.log(`conversionRates["ep"] : ${conversionRates["ep"]}`);
        
        let buyerFundsAsPlatinum = buyerFunds["pp"];
        buyerFundsAsPlatinum += buyerFunds["gp"] / conversionRates["gp"];
        buyerFundsAsPlatinum += buyerFunds["ep"] / conversionRates["gp"] / conversionRates["ep"];
        buyerFundsAsPlatinum += buyerFunds["sp"] / conversionRates["gp"] / conversionRates["ep"] / conversionRates["sp"];
        buyerFundsAsPlatinum += buyerFunds["cp"] / conversionRates["gp"] / conversionRates["ep"] / conversionRates["sp"] / conversionRates["cp"];

        // console.log(`buyerFundsAsPlatinum : ${buyerFundsAsPlatinum}`);

        if (itemCostInPlatinum > buyerFundsAsPlatinum) {
            errorMessageToActor(buyer, `Not enough funds to purchase item.`);
            return;
        }

        let convertCurrency = game.settings.get("fvtt-loot-sheet-npc-dcc", "convertCurrency");

        if (convertCurrency) {
            buyerFundsAsPlatinum -= itemCostInPlatinum;

            // Remove every coin we have
            for (let currency in buyerFunds) {
                buyerFunds[currency] = 0
            }

            // Give us fractions of platinum coins, which will be smoothed out below
            buyerFunds["pp"] = buyerFundsAsPlatinum

        } else {
            // We just pay in partial platinum. 
            // We dont care if we get partial coins or negative once because we compensate later      
            buyerFunds["pp"] -= itemCostInPlatinum

            // Now we exchange all negative funds with coins of lower value
            // We dont need to care about running out of money because we checked that earlier
            for (let currency in buyerFunds) {
                let amount = buyerFunds[currency]
                // console.log(`${currency} : ${amount}`);
                if (amount >= 0) continue;
                
                // If we have ever so slightly negative cp, it is likely due to floating point error
                // We dont care and just give it to the player
                if (currency == "cp") {
                    buyerFunds["cp"] = 0;
                    continue;
                }

                let compCurrency = compensationCurrency[currency]

                buyerFunds[currency] = 0;
                buyerFunds[compCurrency] += amount * conversionRates[compCurrency]; // amount is a negative value so we add it
                // console.log(`Substracted: ${amount * conversionRates[compCurrency]} ${compCurrency}`);
            }
        }

        // console.log(`Smoothing out`);
        // Finally we exchange partial coins with as little change as possible
        for (let currency in buyerFunds) {
            let amount = buyerFunds[currency]

            // console.log(`${currency} : ${amount}: ${conversionRates[currency]}`);

            // We round to 5 decimals. 1 pp is 1000cp, so 5 decimals always rounds good enough
            // We need to round because otherwise we get 15.99999999999918 instead of 16 due to floating point precision
            // If we would floor 15.99999999999918 everything explodes
            let newFund = Math.floor(Math.round(amount * 1e5) / 1e5);
            buyerFunds[currency] = newFund;

            // console.log(`New Buyer funds ${currency}: ${buyerFunds[currency]}`);
            let compCurrency = compensationCurrency[currency]

            // We dont care about fractions of CP
            if (currency != "cp") {
                // We calculate the amount of lower currency we get for the fraction of higher currency we have
                let toAdd = Math.round((amount - newFund) * 1e5) / 1e5 * conversionRates[compCurrency]
                buyerFunds[compCurrency] += toAdd
                // console.log(`Added ${toAdd} to ${compCurrency} it is now ${buyerFunds[compCurrency]}`);
            }    
        }

        // Update buyer's funds
        buyer.update({ "data.currency": buyerFunds });

        console.log(`Funds after purchase: ${buyerFunds}`);

        let moved = await moveItems(seller, buyer, [{ itemId, quantity }]);

        for (let m of moved) {
            chatMessage(
                seller, buyer,
                `${buyer.name} purchases ${quantity} x ${m.item.name} for ${itemCostInGold}gp.`,
                m.item);
        }
    }

    function distributeCoins(containerActor) {
        let actorData = containerActor.data
        let observers = [];
        let players = game.users.players;

        //console.log("Loot Sheet | actorData", actorData);
        // Calculate observers
        for (let player of players) {
            let playerPermission = getLootPermissionForPlayer(actorData, player);
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

                // Add currency to permitted actor
                newCurrency[c] = parseInt(currency[c] || 0) + currencySplit[c].value;

                //console.log("Loot Sheet | New Currency", newCurrency);
                u.update({
                    'data.currency': newCurrency
                });
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

    function lootCoins(containerActor, looter) {
        let actorData = containerActor.data

        let sheetCurrency = actorData.data.currency;
        //console.log("Loot Sheet | Currency data", currency);

        // add currency to actors existing coins
        let msg = [];
        let currency = looter.data.data.currency,
            newCurrency = duplicate(looter.data.data.currency);

        //console.log("Loot Sheet | Current Currency", currency);

        for (let c in currency) {
            // add msg for chat description
            if (sheetCurrency[c].value) {
                //console.log("Loot Sheet | New currency for " + c, currencySplit[c]);
                msg.push(` ${sheetCurrency[c].value} ${c} coins`)
            }
            if (sheetCurrency[c].value != null) {
                // Add currency to permitted actor
                newCurrency[c] = parseInt(currency[c] || 0) + parseInt(sheetCurrency[c].value);
                looter.update({
                    'data.currency': newCurrency
                });
            }
        }

        // Remove currency from loot actor.
        let lootCurrency = containerActor.data.data.currency,
            zeroCurrency = {};

        for (let c in lootCurrency) {
            zeroCurrency[c] = {
                'type': sheetCurrency[c].type,
                'label': sheetCurrency[c].type,
                'value': 0
            }
            containerActor.update({
                "data.currency": zeroCurrency
            });
        }

        // Create chat message for coins received
        if (msg.length != 0) {
            let message = `${looter.data.name} receives: `;
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

    game.socket.on(config.SOCKET, data => {
        console.log("Loot Sheet | Socket Message: ", data);
        if (game.user.isGM && data.processorId === game.user.id) {
            if (data.type === "buy") {
                let buyer = game.actors.get(data.buyerId);
                let seller = canvas.tokens.get(data.tokenId);

                if (buyer && seller && seller.actor) {
                    transaction(seller.actor, buyer, data.itemId, data.quantity);
                }
                else if (!seller) {
                    errorMessageToActor(buyer, "GM not available, the GM must on the same scene to purchase an item.")
                    ui.notifications.error("Player attempted to purchase an item on a different scene.");
                }
            }

            if (data.type === "loot") {
                let looter = game.actors.get(data.looterId);
                let container = canvas.tokens.get(data.tokenId);

                if (looter && container && container.actor) {
                    lootItems(container.actor, looter, data.items);
                }
                else if (!container) {
                    errorMessageToActor(looter, "GM not available, the GM must on the same scene to loot an item.")
                    ui.notifications.error("Player attempted to loot an item on a different scene.");
                }
            }

            if (data.type === "distributeCoins") {
                let container = canvas.tokens.get(data.tokenId);
                if (!container || !container.actor) {
                    errorMessageToActor(looter, "GM not available, the GM must on the same scene to distribute coins.")
                    return ui.notifications.error("Player attempted to distribute coins on a different scene.");
                }
                distributeCoins(container.actor);
            }

            if (data.type === "lootCoins") {
                let looter = game.actors.get(data.looterId);
                let container = canvas.tokens.get(data.tokenId);
                if (!container || !container.actor || !looter) {
                    errorMessageToActor(looter, "GM not available, the GM must on the same scene to loot coins.")
                    return ui.notifications.error("Player attempted to loot coins on a different scene.");
                }
                lootCoins(container.actor, looter);
            }
        }
        if (data.type === "error" && data.targetId === game.user.actorId) {
            console.log("Loot Sheet | Transaction Error: ", data.message);
            return ui.notifications.error(data.message);
        }
    });
});