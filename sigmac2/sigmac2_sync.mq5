//+------------------------------------------------------------------+
//| sigmac2_sync.mq5                                                 |
//| SigmaC-2 network follower: pulls live position snapshots from    |
//| the SigmaBot relay API and converges managed positions locally.  |
//| Fully independent of the local file-based SigmaC EA; never reads |
//| or writes the shared snapshot file.                              |
//+------------------------------------------------------------------+
#property copyright "SigmaC2"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

input group  "连接与信号"
input string InpApiUrl             = "http://8.216.51.10/api/sigmac/signals"; // 实时信号接口地址
input string InpApiToken           = "";            // 接口令牌（预留，暂留空）
input string InpSignalId           = "";            // 信号ID（实时信号页的脱敏账号，如 10***58）
input int    InpPollMilliseconds   = 1000;          // 拉取间隔（毫秒）
input int    InpHttpTimeoutMs      = 5000;          // 单次请求超时（毫秒）
input int    InpSnapshotTimeoutSec = 15;            // 信号数据最大年龄（秒）

input group  "品种与执行"
input string InpSymbolMappings     = "XAUUSD=XAUUSD;EURUSD=EURUSD"; // 品种映射（源=目标，分号分隔）
input long   InpMagicNumber        = 26080602;      // 魔术号（勿与其他EA重复）
input double InpLotMultiplier      = 1.00;          // 手数倍率
input bool   InpSyncStops          = true;          // 同步源端止损止盈
input bool   InpRejectInvalidStops = true;          // 止损不合规时拒绝而非删除
input int    InpMaxRetries         = 3;             // 交易失败重试次数
input int    InpRetryDelayMs       = 500;           // 重试间隔（毫秒）

input group  "风控限额与模式"
input double InpMaxSingleLot       = 1.00;          // 单笔最大手数
input double InpMaxTotalLots       = 3.00;          // 受管总手数上限
input int    InpTradingMode        = 0;             // 交易模式：0仅观察 1全量同步 2仅平仓

#define COMMENT_PREFIX "sigmaC:"
#define LOG_PREFIX     "[SigmaC2] "

struct SourcePosition
  {
   string source_id;
   string symbol;
   ENUM_POSITION_TYPE side;
   double volume;
   double sl;
   double tp;
  };

CTrade g_trade;
long   g_last_sequence=0;

//+------------------------------------------------------------------+
string Trim(string value)
  {
   StringTrimLeft(value);
   StringTrimRight(value);
   return value;
  }
//+------------------------------------------------------------------+
bool JsonLocateValue(const string json,const string key,int &value_start)
  {
   string needle="\""+key+"\"";
   int key_at=StringFind(json,needle);
   if(key_at<0)
      return false;
   int colon=key_at+StringLen(needle);
   int length=StringLen(json);
   while(colon<length && StringGetCharacter(json,colon)!=':')
      colon++;
   if(colon>=length)
      return false;
   value_start=colon+1;
   while(value_start<length)
     {
      ushort character=(ushort)StringGetCharacter(json,value_start);
      if(character!=' ' && character!='\t' && character!='\r' && character!='\n')
         break;
      value_start++;
     }
   return value_start<length;
  }
//+------------------------------------------------------------------+
bool JsonGetRaw(const string json,const string key,string &value)
  {
   int start=0;
   if(!JsonLocateValue(json,key,start))
      return false;
   int length=StringLen(json);
   int finish=start;
   bool quoted=(StringGetCharacter(json,start)=='\"');
   if(quoted)
     {
      finish++;
      bool escaped=false;
      while(finish<length)
        {
         ushort character=(ushort)StringGetCharacter(json,finish);
         if(character=='\"' && !escaped)
           {
            value=StringSubstr(json,start+1,finish-start-1);
            return true;
           }
         if(character=='\\' && !escaped)
            escaped=true;
         else
            escaped=false;
         finish++;
        }
      return false;
     }
   while(finish<length)
     {
      ushort character=(ushort)StringGetCharacter(json,finish);
      if(character==',' || character=='}' || character==']' || character=='\r' || character=='\n')
         break;
      finish++;
     }
   value=Trim(StringSubstr(json,start,finish-start));
   return StringLen(value)>0;
  }
//+------------------------------------------------------------------+
bool JsonGetString(const string json,const string key,string &value)
  {
   int start=0;
   if(!JsonLocateValue(json,key,start) || StringGetCharacter(json,start)!='\"')
      return false;
   return JsonGetRaw(json,key,value);
  }
//+------------------------------------------------------------------+
bool JsonGetLong(const string json,const string key,long &value)
  {
   string raw="";
   if(!JsonGetRaw(json,key,raw))
      return false;
   value=(long)StringToInteger(raw);
   return true;
  }
//+------------------------------------------------------------------+
bool JsonGetDouble(const string json,const string key,double &value)
  {
   string raw="";
   if(!JsonGetRaw(json,key,raw))
      return false;
   value=StringToDouble(raw);
   return true;
  }
//+------------------------------------------------------------------+
bool ExtractObjectsUnderKey(const string json,const string key,string &objects[])
  {
   int start=0;
   if(!JsonLocateValue(json,key,start) || StringGetCharacter(json,start)!='[')
      return false;
   int length=StringLen(json);
   int depth=0;
   int object_start=-1;
   bool quoted=false;
   bool escaped=false;
   int count=0;
   ArrayResize(objects,0);
   for(int index=start+1;index<length;index++)
     {
      ushort character=(ushort)StringGetCharacter(json,index);
      if(quoted)
        {
         if(character=='\"' && !escaped)
            quoted=false;
         if(character=='\\' && !escaped)
            escaped=true;
         else
            escaped=false;
         continue;
        }
      if(character=='\"')
        {
         quoted=true;
         continue;
        }
      if(character=='{')
        {
         if(depth==0)
            object_start=index;
         depth++;
         continue;
        }
      if(character=='}')
        {
         depth--;
         if(depth<0)
            return false;
         if(depth==0 && object_start>=0)
           {
            ArrayResize(objects,count+1);
            objects[count++]=StringSubstr(json,object_start,index-object_start+1);
            object_start=-1;
           }
         continue;
        }
      if(character==']' && depth==0)
         return true;
     }
   return false;
  }
//+------------------------------------------------------------------+
bool ParseSourcePosition(const string object,SourcePosition &position)
  {
   string side="";
   if(!JsonGetString(object,"source_id",position.source_id) || !JsonGetString(object,"symbol",position.symbol) ||
      !JsonGetString(object,"side",side) || !JsonGetDouble(object,"volume",position.volume) ||
      !JsonGetDouble(object,"sl",position.sl) || !JsonGetDouble(object,"tp",position.tp))
      return false;
   if(position.source_id=="" || position.symbol=="" || position.volume<=0.0)
      return false;
   if(side=="BUY")
      position.side=POSITION_TYPE_BUY;
   else if(side=="SELL")
      position.side=POSITION_TYPE_SELL;
   else
      return false;
   return true;
  }
//+------------------------------------------------------------------+
//| "2026-09-30T19:13:40.027Z" -> epoch ms。两个时间戳均来自服务器， |
//| 相减可抵消任何解析时区偏移。                                      |
//+------------------------------------------------------------------+
bool ParseIsoEpochMs(const string iso,long &epoch_ms)
  {
   if(StringLen(iso)<19)
      return false;
   string date_part=StringSubstr(iso,0,10);
   StringReplace(date_part,"-",".");
   string time_part=StringSubstr(iso,11,8);
   datetime epoch=StringToTime(date_part+" "+time_part);
   if(epoch<=0)
      return false;
   long milliseconds=0;
   int dot_at=StringFind(iso,".",19);
   if(dot_at>0)
      milliseconds=(long)StringToInteger(StringSubstr(iso,dot_at+1,3));
   epoch_ms=(long)epoch*1000+milliseconds;
   return true;
  }
//+------------------------------------------------------------------+
bool SnapshotInvalid(string &reason,const string message)
  {
   reason=message;
   return false;
  }
//+------------------------------------------------------------------+
bool FetchSignalsJson(string &json)
  {
   char request_body[];
   char response_body[];
   string response_headers="";
   string request_headers="";
   if(StringLen(InpApiToken)>0)
      request_headers="Authorization: Bearer "+InpApiToken+"\r\n";
   ResetLastError();
   int status=WebRequest("GET",InpApiUrl,request_headers,InpHttpTimeoutMs,request_body,response_body,response_headers);
   if(status==-1)
     {
      PrintFormat("%s WebRequest 失败，错误=%d；请确认已在 选项->EA交易 中将 %s 加入 WebRequest 白名单",
                  LOG_PREFIX,GetLastError(),InpApiUrl);
      return false;
     }
   if(status!=200)
     {
      PrintFormat("%s 接口返回 HTTP %d，本轮跳过",LOG_PREFIX,status);
      return false;
     }
   json=CharArrayToString(response_body,0,WHOLE_ARRAY,CP_UTF8);
   return StringLen(json)>0;
  }
//+------------------------------------------------------------------+
bool ParseLiveSignal(const string json,SourcePosition &positions[],string &reason)
  {
   string signals[];
   if(!ExtractObjectsUnderKey(json,"signals",signals))
      return SnapshotInvalid(reason,"signals 数组缺失或格式无效");

   string signal_object="";
   for(int index=0;index<ArraySize(signals);index++)
     {
      string candidate_id="";
      if(JsonGetString(signals[index],"id",candidate_id) && candidate_id==InpSignalId)
        {
         signal_object=signals[index];
         break;
        }
     }
   if(signal_object=="")
      return SnapshotInvalid(reason,"未找到指定信号（发布器可能已停止或被清理）");

   string status="";
   if(!JsonGetString(signal_object,"status",status) || status!="live")
      return SnapshotInvalid(reason,"信号状态非 live（服务器已停止收到新快照）");

   long sequence=0;
   if(!JsonGetLong(signal_object,"sequence",sequence) || sequence<=0)
      return SnapshotInvalid(reason,"sequence 缺失或无效");
   if(sequence<g_last_sequence)
      return SnapshotInvalid(reason,"sequence 比已处理快照更旧");

   string received_at="";
   string server_time="";
   if(!JsonGetString(signal_object,"receivedAt",received_at) || !JsonGetString(json,"serverTime",server_time))
      return SnapshotInvalid(reason,"时间字段缺失");
   long received_ms=0;
   long server_ms=0;
   if(!ParseIsoEpochMs(received_at,received_ms) || !ParseIsoEpochMs(server_time,server_ms))
      return SnapshotInvalid(reason,"时间字段无法解析");
   long age_ms=server_ms-received_ms;
   if(age_ms>(long)InpSnapshotTimeoutSec*1000)
      return SnapshotInvalid(reason,StringFormat("信号数据超时（年龄=%I64dms，限制=%dms）",age_ms,InpSnapshotTimeoutSec*1000));
   if(age_ms<-(long)InpSnapshotTimeoutSec*1000)
      return SnapshotInvalid(reason,"信号时间异常超前");

   long position_count=0;
   if(!JsonGetLong(signal_object,"positionCount",position_count) || position_count<0)
      return SnapshotInvalid(reason,"positionCount 缺失或无效");

   string objects[];
   if(!ExtractObjectsUnderKey(signal_object,"positions",objects))
      return SnapshotInvalid(reason,"positions 数组缺失或格式无效");
   if(position_count!=ArraySize(objects))
      return SnapshotInvalid(reason,"positionCount 与 positions 数量不一致");

   ArrayResize(positions,0);
   for(int index=0;index<ArraySize(objects);index++)
     {
      SourcePosition parsed;
      if(!ParseSourcePosition(objects[index],parsed))
         return SnapshotInvalid(reason,"positions 中存在字段缺失或无效的持仓");
      for(int previous=0;previous<index;previous++)
         if(positions[previous].source_id==parsed.source_id)
            return SnapshotInvalid(reason,"positions 中存在重复 source_id");
      ArrayResize(positions,index+1);
      positions[index]=parsed;
     }
   if(sequence>g_last_sequence)
      g_last_sequence=sequence;
   return true;
  }
//+------------------------------------------------------------------+
string TargetSymbolFor(const string source_symbol)
  {
   string mappings[];
   int mapping_count=StringSplit(InpSymbolMappings,';',mappings);
   for(int index=0;index<mapping_count;index++)
     {
      string pair[];
      if(StringSplit(mappings[index],'=',pair)!=2)
         continue;
      if(Trim(pair[0])==source_symbol)
         return Trim(pair[1]);
     }
   return "";
  }
//+------------------------------------------------------------------+
double NormalizeVolume(const string symbol,const double requested)
  {
   double minimum=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
   double maximum=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
   if(minimum<=0.0 || maximum<=0.0 || step<=0.0 || requested<minimum)
      return 0.0;
   double capped=MathMin(requested,maximum);
   double normalized=MathFloor((capped+1e-10)/step)*step;
   return NormalizeDouble(normalized,8);
  }
//+------------------------------------------------------------------+
string SourceComment(const string source_id)
  {
   return COMMENT_PREFIX+source_id;
  }
//+------------------------------------------------------------------+
bool IsManagedPositionForSource(const string source_id)
  {
   return PositionGetInteger(POSITION_MAGIC)==InpMagicNumber && PositionGetString(POSITION_COMMENT)==SourceComment(source_id);
  }
//+------------------------------------------------------------------+
double ManagedVolumeForSource(const string source_id)
  {
   double total=0.0;
   for(int index=PositionsTotal()-1;index>=0;index--)
     {
      ulong ticket=PositionGetTicket(index);
      if(ticket>0 && IsManagedPositionForSource(source_id))
         total+=PositionGetDouble(POSITION_VOLUME);
     }
   return total;
  }
//+------------------------------------------------------------------+
bool SourceExists(const string source_id,const SourcePosition &positions[])
  {
   for(int index=0;index<ArraySize(positions);index++)
      if(positions[index].source_id==source_id)
         return true;
   return false;
  }
//+------------------------------------------------------------------+
bool IsSuccessfulTradeResult(void)
  {
   uint code=g_trade.ResultRetcode();
   return code==TRADE_RETCODE_DONE || code==TRADE_RETCODE_DONE_PARTIAL || code==TRADE_RETCODE_PLACED;
  }
//+------------------------------------------------------------------+
void LogTradeFailure(const string action,const int attempt)
  {
   PrintFormat("%s %s 失败（第 %d/%d 次）：retcode=%u，%s",LOG_PREFIX,action,attempt,InpMaxRetries,g_trade.ResultRetcode(),g_trade.ResultRetcodeDescription());
  }
//+------------------------------------------------------------------+
bool StopsAreValid(const string symbol,const ENUM_POSITION_TYPE side,const double sl,const double tp)
  {
   if(sl==0.0 && tp==0.0)
      return true;
   MqlTick tick;
   if(!SymbolInfoTick(symbol,tick))
      return false;
   double point=SymbolInfoDouble(symbol,SYMBOL_POINT);
   int stops_level=(int)SymbolInfoInteger(symbol,SYMBOL_TRADE_STOPS_LEVEL);
   double distance=point*stops_level;
   if(side==POSITION_TYPE_BUY)
     {
      if(sl>0.0 && sl>tick.bid-distance)
         return false;
      if(tp>0.0 && tp<tick.bid+distance)
         return false;
     }
   else
     {
      if(sl>0.0 && sl<tick.ask+distance)
         return false;
      if(tp>0.0 && tp>tick.ask-distance)
         return false;
     }
   return true;
  }
//+------------------------------------------------------------------+
bool OpenManagedPosition(const SourcePosition &source,const string target_symbol,const double volume)
  {
   if(InpTradingMode!=1)
     {
      PrintFormat("%s 观察模式：将开 %s %.2f -> %s",LOG_PREFIX,source.side==POSITION_TYPE_BUY?"BUY":"SELL",volume,target_symbol);
      return false;
     }
   if(!SymbolSelect(target_symbol,true))
     {
      PrintFormat("%s 品种不可用，无法开仓：%s",LOG_PREFIX,target_symbol);
      return false;
     }
   if(InpSyncStops && InpRejectInvalidStops && !StopsAreValid(target_symbol,source.side,source.sl,source.tp))
     {
      PrintFormat("%s 源端 SL/TP 不符合目标品种规则，拒绝开仓：%s",LOG_PREFIX,target_symbol);
      return false;
     }
   for(int attempt=1;attempt<=InpMaxRetries;attempt++)
     {
      bool sent=(source.side==POSITION_TYPE_BUY)
                ? g_trade.Buy(volume,target_symbol,0.0,InpSyncStops?source.sl:0.0,InpSyncStops?source.tp:0.0,SourceComment(source.source_id))
                : g_trade.Sell(volume,target_symbol,0.0,InpSyncStops?source.sl:0.0,InpSyncStops?source.tp:0.0,SourceComment(source.source_id));
      if(sent && IsSuccessfulTradeResult())
         return true;
      LogTradeFailure("开仓 "+target_symbol,attempt);
      if(attempt<InpMaxRetries)
         Sleep(InpRetryDelayMs);
     }
   return false;
  }
//+------------------------------------------------------------------+
bool CloseManagedTicket(const ulong ticket,const string reason)
  {
   if(InpTradingMode==0)
     {
      PrintFormat("%s 观察模式：将平仓 ticket=%I64u（%s）",LOG_PREFIX,ticket,reason);
      return false;
     }
   for(int attempt=1;attempt<=InpMaxRetries;attempt++)
     {
      if(g_trade.PositionClose(ticket) && IsSuccessfulTradeResult())
         return true;
      LogTradeFailure("平仓 "+(string)ticket,attempt);
      if(attempt<InpMaxRetries)
         Sleep(InpRetryDelayMs);
     }
   return false;
  }
//+------------------------------------------------------------------+
bool ReduceManagedVolume(const string source_id,double amount)
  {
   for(int index=PositionsTotal()-1;index>=0 && amount>0.0;index--)
     {
      ulong ticket=PositionGetTicket(index);
      if(ticket==0 || !IsManagedPositionForSource(source_id))
         continue;
      double current=PositionGetDouble(POSITION_VOLUME);
      string symbol=PositionGetString(POSITION_SYMBOL);
      double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
      double minimum=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
      double close_volume=MathMin(current,amount);
      close_volume=MathFloor((close_volume+1e-10)/step)*step;
      if(close_volume<=0.0)
         continue;
      if(InpTradingMode==0)
        {
         PrintFormat("%s 观察模式：将减仓 ticket=%I64u %.2f",LOG_PREFIX,ticket,close_volume);
         return false;
        }
      bool closed=false;
      for(int attempt=1;attempt<=InpMaxRetries;attempt++)
        {
         bool sent=(close_volume>=current-minimum/2.0) ? g_trade.PositionClose(ticket) : g_trade.PositionClosePartial(ticket,close_volume);
         if(sent && IsSuccessfulTradeResult())
           {
            closed=true;
            break;
           }
         LogTradeFailure("减仓 "+(string)ticket,attempt);
         if(attempt<InpMaxRetries)
            Sleep(InpRetryDelayMs);
        }
      if(!closed)
         return false;
      amount-=close_volume;
     }
   return amount<=0.0000001;
  }
//+------------------------------------------------------------------+
void UpdateManagedStops(const string source_id,const string symbol,const ENUM_POSITION_TYPE side,const double sl,const double tp)
  {
   if(!InpSyncStops || InpTradingMode!=1)
      return;
   if(InpRejectInvalidStops && !StopsAreValid(symbol,side,sl,tp))
     {
      PrintFormat("%s 源端 SL/TP 不符合目标品种规则，跳过修改：%s",LOG_PREFIX,symbol);
      return;
     }
   for(int index=PositionsTotal()-1;index>=0;index--)
     {
      ulong ticket=PositionGetTicket(index);
      if(ticket==0 || !IsManagedPositionForSource(source_id))
         continue;
      double current_sl=PositionGetDouble(POSITION_SL);
      double current_tp=PositionGetDouble(POSITION_TP);
      if(MathAbs(current_sl-sl)<0.000000001 && MathAbs(current_tp-tp)<0.000000001)
         continue;
      bool changed=false;
      for(int attempt=1;attempt<=InpMaxRetries;attempt++)
        {
         if(g_trade.PositionModify(ticket,sl,tp) && IsSuccessfulTradeResult())
           {
            changed=true;
            break;
           }
         LogTradeFailure("修改 SL/TP "+(string)ticket,attempt);
         if(attempt<InpMaxRetries)
            Sleep(InpRetryDelayMs);
        }
      if(!changed)
         PrintFormat("%s ticket=%I64u 的 SL/TP 更新将于下一轮重试",LOG_PREFIX,ticket);
     }
  }
//+------------------------------------------------------------------+
bool DesiredVolumeIsWithinLimits(const SourcePosition &positions[])
  {
   double total=0.0;
   for(int index=0;index<ArraySize(positions);index++)
     {
      string target=TargetSymbolFor(positions[index].symbol);
      if(target=="")
         continue;
      if(!SymbolSelect(target,true))
        {
         PrintFormat("%s 未选择或不存在目标品种：%s -> %s",LOG_PREFIX,positions[index].symbol,target);
         return false;
        }
      double requested=positions[index].volume*InpLotMultiplier;
      double maximum=SymbolInfoDouble(target,SYMBOL_VOLUME_MAX);
      if(requested>InpMaxSingleLot+0.0000001 || requested>maximum+0.0000001)
        {
         PrintFormat("%s 单笔目标手数 %.2f 超过上限（配置=%.2f，品种=%.2f），整份快照不执行",LOG_PREFIX,requested,InpMaxSingleLot,maximum);
         return false;
        }
      double desired=NormalizeVolume(target,requested);
      if(desired<=0.0)
        {
         PrintFormat("%s 手数无法按目标规格规范化：%s，源手数=%.2f",LOG_PREFIX,target,positions[index].volume);
         return false;
        }
      total+=desired;
     }
   if(total>InpMaxTotalLots+0.0000001)
     {
      PrintFormat("%s 目标总手数 %.2f 超过限制 %.2f，整份快照不执行",LOG_PREFIX,total,InpMaxTotalLots);
      return false;
     }
   return true;
  }
//+------------------------------------------------------------------+
void CloseStaleManagedPositions(const SourcePosition &positions[])
  {
   for(int index=PositionsTotal()-1;index>=0;index--)
     {
      ulong ticket=PositionGetTicket(index);
      if(ticket==0 || PositionGetInteger(POSITION_MAGIC)!=InpMagicNumber)
         continue;
      string comment=PositionGetString(POSITION_COMMENT);
      if(StringFind(comment,COMMENT_PREFIX)!=0)
         continue;
      string source_id=StringSubstr(comment,StringLen(COMMENT_PREFIX));
      if(!SourceExists(source_id,positions))
         CloseManagedTicket(ticket,"源端持仓已不存在");
     }
  }
//+------------------------------------------------------------------+
void Synchronize(const SourcePosition &positions[])
  {
   if(InpTradingMode!=2 && !DesiredVolumeIsWithinLimits(positions))
      return;

   CloseStaleManagedPositions(positions);
   if(InpTradingMode==2)
      return;

   for(int index=0;index<ArraySize(positions);index++)
     {
      SourcePosition source=positions[index];
      string target=TargetSymbolFor(source.symbol);
      if(target=="")
        {
         PrintFormat("%s 未配置品种映射，忽略：%s",LOG_PREFIX,source.symbol);
         continue;
        }
      double desired=NormalizeVolume(target,source.volume*InpLotMultiplier);
      if(desired<=0.0)
         continue;
      double existing=ManagedVolumeForSource(source.source_id);
      double step=SymbolInfoDouble(target,SYMBOL_VOLUME_STEP);
      if(existing+step/2.0<desired)
         OpenManagedPosition(source,target,NormalizeVolume(target,desired-existing));
      else if(existing>desired+step/2.0)
         ReduceManagedVolume(source.source_id,existing-desired);
      UpdateManagedStops(source.source_id,target,source.side,source.sl,source.tp);
     }
  }
//+------------------------------------------------------------------+
int OnInit()
  {
   bool url_valid=StringFind(InpApiUrl,"http://")==0 || StringFind(InpApiUrl,"https://")==0;
   if(!url_valid || StringLen(InpSignalId)==0 || InpMagicNumber<=0 || InpLotMultiplier<=0.0 || InpMaxSingleLot<=0.0 ||
      InpMaxTotalLots<=0.0 || InpMaxSingleLot>InpMaxTotalLots || InpPollMilliseconds<250 ||
      InpHttpTimeoutMs<1000 || InpHttpTimeoutMs>60000 || InpSnapshotTimeoutSec<2 || InpMaxRetries<1 ||
      InpRetryDelayMs<0 || InpTradingMode<0 || InpTradingMode>2)
     {
      Print(LOG_PREFIX,"输入参数无效，EA 未启动");
      return INIT_PARAMETERS_INCORRECT;
     }
   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetAsyncMode(false);
   EventSetMillisecondTimer(InpPollMilliseconds);
   PrintFormat("%s 已启动；模式=%d，信号=%s，接口=%s",LOG_PREFIX,InpTradingMode,InpSignalId,InpApiUrl);
   Print(LOG_PREFIX,"请确认已在 选项->EA交易 中将接口域名加入 WebRequest 白名单，并保持模式=0 直到 Journal 验证通过");
   return INIT_SUCCEEDED;
  }
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
  }
//+------------------------------------------------------------------+
void OnTimer()
  {
   string json="";
   if(!FetchSignalsJson(json))
      return;
   SourcePosition positions[];
   string reason="";
   if(!ParseLiveSignal(json,positions,reason))
     {
      PrintFormat("%s 信号无效：%s；保持现有受管仓位",LOG_PREFIX,reason);
      return;
     }
   Synchronize(positions);
  }
//+------------------------------------------------------------------+
