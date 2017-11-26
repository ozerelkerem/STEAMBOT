const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');

var wait = require('wait.for');
var mysql      = require('mysql');
var connection = mysql.createConnection({
	host     : 'localhost',
	user     : 'root',
	password : '12345678',
	database : 'roulette'
});
connection.connect();
var fs = require('fs');
const config = require('./config.json');
const itemsData = require('./items.json');
const client = new SteamUser();
const community = new SteamCommunity();
const manager = new TradeOfferManager({
	steam: client,
	community: community,
	language: 'en'
});
const logOnOptions = {
	accountName: config.username,
	password: config.password,
	//twoFactorCode: SteamTotp.generateAuthCode(config.sharedSecret)
};
client.logOn(logOnOptions);


client.on("loggedOn",function(){
	client.setPersona(SteamUser.Steam.EPersonaState.Online);
	console.log("Giriş Yapıldı.");

	
	/*Bot ile Sitedeki Marketi Eşler*/
	IntervalSet(Setup,20000);

	

})
client.on("webSession",function(sessionid,cookies){
	manager.setCookies(cookies);
	community.setCookies(cookies);
	//community.startConfirmationChecker(10000, config.sharedSecret);
	
	
});



manager.on("newOffer", function(offer){
	var SenderSteamID = offer.partner.getSteamID64();
	console.log(SenderSteamID + " steamidli üyeden trade isteği geldi " + offer.id);
	if(offer.itemsToGive.length==0)
	{
		//acceptOffer(offer);
		var totalValue = calculateItemsValue(offer.itemsToReceive);
		sendValueToUser(SenderSteamID,totalValue,getItemsString(offer.itemsToReceive));
		console.log("ID = " + offer.id + " Değer = " + totalValue + " Kabul Edildi");
	}
	else
	{
		console.log("ID = " + offer.id + " Item İsteğinde bulundu beklemeye alındı.");	
	}
})
function acceptOffer(offer)
{
	offer.accept(function(err,status){
		if(err)
			console.log("Teklifi kabul ederken hata oluştu");
		else
			console.log("Teklif kabul edildi durum = "+ status);
	});
}

function declineOffer(offer)
{
	offer.decline(function(err,status){
		if(err)
			console.log("Teklifi red ederken hata oluştu");
		else
			console.log("Teklif red edildi durum = "+ status);
	})
}

function calculateItemsValue(items)
{
	var totalValue = 0;
	for(var i = 0;i<items.length;i++)
	{
		var itemprice = itemsData[items[i].market_hash_name];
		if(itemprice!=='undefined')
			totalValue+=itemprice;
	}
	return totalValue;
}
function getItemsString(items)
{
	var itemsArray = [];
	for(var i = 0;i<items.length;i++)
	{
		itemsArray.push(items[i].market_hash_name);
	}
	return itemsArray.join();
}

function sendValueToUser(steamid,value,itemslist)
{

	connection.query("update users set balance=balance + '"+value+"' where steamid='"+steamid+"'",function(err,rows,field){
		if(err) throw err;
		if(rows.length>0)
		{
			console.log(steamid + " steamidlı üyeye bakiye eklendi");
			connection.query("insert into deposits (steamid,value,items) values('"+steamid+"','"+value+"','"+itemslist+"')",function(err){
				if(err) throw err;
			});
		}
		else
		{
			console.log(steamid+" böyle bir üye mevcut değil");
		}
	});
}

function getItemsPrice()
{
	connection.query("select market_hash_name,price from items",function(err,rows,field){

		if(err) throw err;
		var jsonData={};
		for(var i = 0; i<rows.length;i++)
		{
			var name  = rows[i].market_hash_name;
			var price = rows[i].price;

			jsonData[name]=price;
		}
		var dictstring = JSON.stringify(jsonData);
		fs.writeFile("items.json",dictstring);

	});

}

function getMyItems()
{
	/*TODO SİTEDEKİ BÜTÜN ENVANTER TEMİZLENMEK YERİNE SADECE BOTUN ENVANTERI TEMIZLENECEK EKLENECEK. SİTEDEKİ MAĞAZA BOTLARDAN ÇEKİCEK.*/
	manager.loadInventory(config.appid,2,true,function(err,inventory,currencies){
		connection.query("truncate inventory",function(err,rows,field){
			if(err) throw err;
			console.log("Veritabanındaki envanter temizlendi.");
			var ItemsArray = [];
			for (var i =0; i < inventory.length; i++)
			{
				ItemsArray.push("('"+inventory[i].id+"','"+inventory[i].market_hash_name+"')");
			}
			connection.query("insert into inventory (UID,market_hash_name) values"+ItemsArray.join(),function(err,rows,field){
				if(err) throw err;
				console.log("Envanter Veritabanına Aktarıldı.");
			});
		});
	});
}



function removeMyItemsFromDB(Items)
{
	for(i=0;i<Items.length;i++)
	{
		var Item = Items.id;
		wait.forMethod(connection,"query","DELETE FROM inventory WHERE UID = '"+Item.id+"'");
	}
	console.log("Gonderilen Itemlar Silindi.");
}
function createOffer(Items,TradeURL)
{
	var Offer = manager.createOffer(TradeURL);
	for(var i = 0; i < Items.length; i++)
	{
		var aItem = Items[i];
		Offer.addMyItem(aItem);
	}
	return Offer;
}
function getBuyRequest()
{
	var Result = wait.forMethod(connection,"query", "select b.id,b.items,u.trade_url from buys b inner join users u on u.steamid=b.steamid  where b.status='0' and u.trade_url!=''");
	var ReqArr = [];
	for(var i = 0; i<Result.length;i++)
	{
		var itemsToSend = Result[i].items.split(",");
		var TradeURL = Result[i].trade_url;
		var BID = Result[i].id;
		ReqArr.push({"Items":itemsToSend,"TradeURL":TradeURL,"ID":BID});
	}
	return ReqArr;
}

function OnTradeSent()
{
	//TODO Trade yollandı trade durumunu güncelle.
}

function getWaitingOffers()
{
	var Result = wait.forMethod(connection,"query", "select b.status,b.steamid,b.OfferID,b.SteamID,b.Price from buys b inner join users u on u.steamid=b.steamid  where b.status='0' or b.status='2' or b.status='9'");
	console.log(Result.length + " Adet Bekleyen İstekler Bulundu");

	for(i=0;i<Result.length;i++)
	{
		var aReq = Result[i];
		var aReqStatus = aReq.status;
		var OfferID = aReq.OfferID;
		var OfferValue = aReq.Price;
		var SteamID = aReq.SteamID;
		var Offer = wair.forMethod(manager,"getOffer",OfferID);

		if((Offer.state == 1) || (Offer.state == 5) || (Offer.state == 6) || (Offer.state == 7) || (Offer.state == 8) || (Offer.state == 10))
		{
			wait.forMethod(connection,"query","UPDATE buys set status = '-1' where OfferID = '"+OfferID+"'");
			console.log("ID = " + OfferID + " Takas Başarısız. Kullanıcıya Para İade Edilecek...");
			wait.forMethod(connection,"query","update users set balance = balance + '"+OfferValue+"' WHERE SteamID = '"+SteamID+"'");
			console.log("ID = " + SteamID + " Bakiye Eklendi Değer = " + OfferValue);
		}
	}
}

	

function checkBuyRequest()
{
	console.log("Satın Alma İşlemleri Kontrol Ediliyor...");

	var ReqArr = getBuyRequest(); //Istek Listesi

	console.log(ReqArr.length + " Adet İstek Bulundu.");

	for(var i = 0; i<ReqArr.length;i++)
	{
		var aReq = ReqArr[i];

		var Inv = wait.forMethod(manager,"loadInventory",config.appid,2,true);
		var itemsToOffer = [];
		for(var j = 0; j<Inv.length; j++)
		{
			
			var aItem = Inv[j];
			//Inventory de bulunan itemleri ekle
			if((aReq.Items.indexOf(aItem.market_hash_name)) > -1)
			{
						var index = aReq.Items.indexOf(aItem.market_hash_name);
						itemsToOffer.push(aItem);
						aReq.Items.splice(index,1);
			}		
		}
		// İstekteki bütün itemler bulunmuşsa offer oluştur ve yolla.
			if(aReq.Items.length < 1)
			{
				console.log("ID = "+ aReq.ID + "Geçerli Trade Yollanıyor... ");

				var aOffer = createOffer(itemsToOffer,aReq.TradeURL);
				var Result = wait.forMethod(aOffer,"send");
				console.log("ID = "+ aReq.ID + " Sonuç = " + Result);
				if(Result=="pending")
				{
					console.log("ID = " + aOffer.id  +" Trade Onay Bekliyor");
				}
				else if(Result == "sent")
				{
					console.log("ID = " + aOffer.id  +" Trade yollandı.");
				}
				removeMyItemsFromDB(aReq.Items); // Yollanan itemları siteden sil.
				wait.forMethod(connection,"query","UPDATE buys set OfferID = '"+aOffer.id+"',Status='"+aOffer.state+"' WHERE ID='"+aReq.ID+"'"); // İsteğin Offer numarsını güncelle. Trade Durumunu Güncelle

				
			}
			else
			{
				console.log("ID = "+ aReq.ID + " Botta Itemlar Bulunamadi.");
			}
	}
}

function Setup()
{
	
	/*DBDEN ITEMLARIN FIYATLARINI CEKER*/
	getItemsPrice();
	/*Siteye Bottaki Itemlari Aktar*/
	getMyItems();
	/*Gelen Satın Alma İsteklerini Kontrol eder ve Yollar*/
	wait.launchFiber(checkBuyRequest);

	wait.launchFiber(getWaitingOffers);
}

function IntervalSet(funct,time)
{
	setInterval(()=>{setTimeout(funct,time)},time);
}
