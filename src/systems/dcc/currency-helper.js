import DCC from "../../../../../systems/dcc/module/config.js";

export default class CurrencyHelper {
    static convertCurrencyObjectToCopper(currencies) {
        let total = 0
        if(currencies) {
            Object.keys(currencies).forEach(coin => {
                total += currencies[coin] * DCC.currencyValue[coin]
            });
        }

        return total
    }

    static convertCurrenciesToString(currencies) {
        let total = ""
        console.log(currencies)
        Object.keys(currencies).forEach(coin => {
            if(currencies[coin] > 0) {
                total += `${currencies[coin]} ${coin} `
            }
        });

        return total
    }

    static convertCopperToCurrencyObject(copper) {
        let remainder = copper
        const currencyObject = {}
        Object.keys(DCC.currencyValue).forEach(coin => {
            const t = Math.floor(remainder / DCC.currencyValue[coin])
            if(t > 0)  currencyObject[coin] = t
            remainder = remainder % DCC.currencyValue[coin]
        });

        return currencyObject
    }

    static convertCopperToString(copper) {
        const currencyObject = this.convertCopperToCurrencyObject(copper)
        return this.convertCurrenciesToString(currencyObject)
    }

    static multiply(currencies, multiplier) {
        const copper = this.convertCurrencyObjectToCopper(currencies)
        return this.convertCopperToCurrencyObject(copper * multiplier)
    }
}