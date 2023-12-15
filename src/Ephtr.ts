import { Address, BigDecimal, BigInt, Bytes, dataSource, ethereum, log } from "@graphprotocol/graph-ts"
import {
    Transfer as TransferEvent, ERC20
} from "../generated/IndexFactoryV1/ERC20"
import { Emissions } from "../generated/ephtr/Emissions"
import { createOrLoadIndexEntity, createOrLoadIndexAssetEntity, createOrLoadIndexAccountEntity, createOrLoadHistoricalAccountBalance, createOrLoadAccountEntity, createOrLoadHistoricalPrice } from "./EntityCreation"

export function handleTransfer(event: TransferEvent): void {
    let index = createOrLoadIndexEntity(event.address)
    let phtrAddress = '0x3b9805E163b3750e7f13a26B06F030f2d3b799F5'
    if (index.decimals == 0) {
        let ephtrContract = ERC20.bind(event.address)
        let decimals = ephtrContract.decimals()
        let name = ephtrContract.name()
        let symbol = ephtrContract.symbol()
        let chainID = dataSource.context().getBigInt('chainID')
        index.decimals = decimals
        index.name = name
        index.symbol = symbol
        index.chainID = chainID
        index.creationDate = event.block.timestamp
        index.version = 'v1'
        let indexAssetEntity = createOrLoadIndexAssetEntity(event.address, Bytes.fromHexString(phtrAddress))
        let phtrContract = ERC20.bind(Address.fromString(phtrAddress))
        indexAssetEntity.chainID = chainID
        indexAssetEntity.decimals = decimals
        indexAssetEntity.symbol = phtrContract.symbol()
        indexAssetEntity.decimals = phtrContract.decimals()
        indexAssetEntity.name = phtrContract.name()
        indexAssetEntity.weight = 255
        let indexAssetArray: Bytes[] = []
        indexAssetArray.push(indexAssetEntity.id)
        index.assets = indexAssetArray
        indexAssetEntity.save()
        index.save()
    }
    let scalar = new BigDecimal(BigInt.fromI32(10).pow(u8(index.decimals)))
    if (event.params.from != Address.fromString('0x0000000000000000000000000000000000000000') && event.params.value > BigInt.zero()) {
        let fromAccount = createOrLoadIndexAccountEntity(event.address, event.params.from)
        createOrLoadAccountEntity(event.params.from)
        fromAccount.balance = fromAccount.balance.minus(new BigDecimal(event.params.value).div(scalar))
        if (fromAccount.balance == BigDecimal.zero()) {
            index.holders = index.holders.minus(BigInt.fromI32(1))
        }
        fromAccount.save()
        let historicalAccountBalanceEntity = createOrLoadHistoricalAccountBalance(event.address, event.params.from, event)
        historicalAccountBalanceEntity.balance = fromAccount.balance
        historicalAccountBalanceEntity.save()
    }
    if (event.params.from == Address.fromString('0x0000000000000000000000000000000000000000') && event.params.to != Address.fromString('0x0000000000000000000000000000000000000000') && event.params.value > BigInt.zero()) {
        index.totalSupply = index.totalSupply.plus(new BigDecimal(event.params.value).div(scalar))
    }
    if (event.params.to != Address.fromString('0x0000000000000000000000000000000000000000') && event.params.value > BigInt.zero()) {
        let toAccount = createOrLoadIndexAccountEntity(event.address, event.params.to)
        createOrLoadAccountEntity(event.params.to)
        if (toAccount.balance == BigDecimal.zero()) {
            index.holders = index.holders.plus(BigInt.fromI32(1))
        }
        toAccount.balance = toAccount.balance.plus(new BigDecimal(event.params.value).div(scalar))
        toAccount.save()
        let historicalAccountBalanceEntity = createOrLoadHistoricalAccountBalance(event.address, event.params.to, event)
        historicalAccountBalanceEntity.balance = toAccount.balance
        historicalAccountBalanceEntity.save()
    }
    if (event.params.to == Address.fromString('0x0000000000000000000000000000000000000000') && event.params.from != Address.fromString('0x0000000000000000000000000000000000000000') && event.params.value > BigInt.zero()) {
        index.totalSupply = index.totalSupply.minus(new BigDecimal(event.params.value).div(scalar))
    }
    index.save()
}

export function ephtrBlockHandler(block: ethereum.Block): void {
    let ephtrAddress = '0x3b9805E163b3750e7f13a26B06F030f2d3b799F5'
    let phtrAddress = '0xE1Fc4455f62a6E89476f1072530C20CF1A0622dA'
    let emissionsAddress = '0x4819CecF672177F37e5450Fa6DC78d9BaAfa74be'
    let indexAssetEntity = createOrLoadIndexAssetEntity(Bytes.fromHexString(ephtrAddress), Bytes.fromHexString(phtrAddress))
    let historicalPriceEntity = createOrLoadHistoricalPrice(Bytes.fromHexString(ephtrAddress), block.timestamp)
    let phtrContract = ERC20.bind(Address.fromString(phtrAddress))
    let emissionsContract = Emissions.bind(Address.fromString(emissionsAddress))

    let phtrScalar = new BigDecimal(BigInt.fromI32(10).pow(u8(createOrLoadIndexAssetEntity(Bytes.fromHexString(ephtrAddress),Bytes.fromHexString(phtrAddress)).decimals)))

    let phtrBalance = new BigDecimal(phtrContract.balanceOf(Address.fromString(ephtrAddress)))
    let totalSupply = createOrLoadIndexEntity(Bytes.fromHexString(ephtrAddress)).totalSupply
    log.debug("balance :{} total supply : {}", [phtrBalance.toString(), totalSupply.toString()])

    if (phtrBalance > BigDecimal.zero() && totalSupply > BigDecimal.zero()) {
        let withdrawableAmount = new BigDecimal(emissionsContract.withdrawable())
        phtrBalance = phtrBalance.plus(withdrawableAmount).div(phtrScalar)

        indexAssetEntity.balance = phtrBalance


        totalSupply = totalSupply.div(phtrScalar)

        let price = phtrBalance.div(totalSupply)

        historicalPriceEntity.price = price
        historicalPriceEntity.save()
        indexAssetEntity.save()
    }
    else {
        historicalPriceEntity.price = BigDecimal.fromString("1.00")
        historicalPriceEntity.save()
    }
}