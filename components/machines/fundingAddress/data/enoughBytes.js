"use strict"

module.exports = function (properties, stateMachine, state) {
    const DataFetcher = require('dagcoin-fsm/lib/dataFetcher');
    const fetcher = new DataFetcher(properties, stateMachine, state);
    const dbManager = require('dagcoin-core/lib/databaseManager').getInstance();

    if (!properties.sharedAddress) {
        throw Error(`NO sharedAddress IN DataFetcher proofInDb. PROPERTIES: ${properties}`);
    }

    fetcher.retrieveData = function () {
        return dbManager.query(
            `SELECT asset, address, is_stable, SUM(amount) AS balance
            FROM outputs CROSS JOIN units USING(unit)
            WHERE is_spent=0 AND sequence='good' AND address = ?
            GROUP BY asset, address, is_stable
            UNION ALL
            SELECT NULL AS asset, address, 1 AS is_stable, SUM(amount) AS balance FROM witnessing_outputs
            WHERE is_spent=0 AND address = ? GROUP BY address
            UNION ALL
            SELECT NULL AS asset, address, 1 AS is_stable, SUM(amount) AS balance FROM headers_commission_outputs
            WHERE is_spent=0 AND address = ? GROUP BY address`,
            [properties.sharedAddress, properties.sharedAddress, properties.sharedAddress]
        ).then((rows) => {
            const assocBalances = {};

            assocBalances["base"] = {stable: 0, pending: 0, total: 0};

            for (let i = 0; i < rows.length; i++) {
                var row = rows[i];

                console.log(`SOMETHING FOR ${properties.sharedAddress}: ${JSON.stringify(row)}`);

                var asset = row.asset || "base";

                if (!assocBalances[asset]) {
                    assocBalances[asset] = {stable: 0, pending: 0, total: 0};
                    console.log(`CREATED THE BALANCES ARRAY OF ADDRESS ${properties.sharedAddress} FOR ASSET ${asset}`);
                }

                console.log(`UPDATING BALANCE OF ${properties.sharedAddress} FOR ASSET ${asset}: ${row.is_stable ? 'stable' : 'pending'} ${row.balance}`);
                assocBalances[asset][row.is_stable ? 'stable' : 'pending'] += row.balance;
                assocBalances[asset]['total'] += row.balance;
            }

            return Promise.resolve(assocBalances['base'].total >= 5000);
        });
    };

    return fetcher;
};
