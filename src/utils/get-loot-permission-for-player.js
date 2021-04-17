/**
 * Retrieve the loot permission for a player, given the current actor data.
 *
 * It first tries to get an entry from the actor's permissions, if none is found it uses default, otherwise returns 0.
 * @param actorData
 * @param player
 * @returns {string|boolean|number|*}
 */
function getLootPermissionForPlayer(actorData, player) {
    let defaultPermission = actorData.permission.default;
    if (player.data._id in actorData.permission) {
        //console.log("Loot Sheet | Found individual actor permission");
        return actorData.permission[player.data._id];
        //console.log("Loot Sheet | assigning " + actorData.permission[player.data._id] + " permission to hidden field");
    } else if (typeof defaultPermission !== "undefined") {
        //console.log("Loot Sheet | default permissions", actorData.permission.default);
        return defaultPermission;
    } else {
        return 0;
    }
}

export default getLootPermissionForPlayer